/** AG1 global DB-owned version: source Core read/name-only CAS no writes outside
 * the one parametrized UPDATE; real SQL concurrency is evidenced separately.
 */
import { beforeEach,describe,expect,it,vi } from "vitest";
const m=vi.hoisted(()=>({
  query:vi.fn(),invalidate:vi.fn(),publish:vi.fn(),log:vi.fn(),
}));
vi.mock("@gafus/prisma",()=>({prisma:{$queryRaw:m.query}}));
vi.mock("@gafus/logger",()=>({
  createWebLogger:()=>({error:m.log,info:vi.fn(),warn:vi.fn()}),
}));
vi.mock("../training/trainingDayContent",()=>({
  invalidateCourseContentCache:m.invalidate,
}));
vi.mock("../training/trainingContentRevision",()=>({
  publishCourseContentChange:m.publish,
}));
import {readCourseNameVersion,updateCourseNameVersioned} from "./courseVersionService";
const A={id:"trainerA",role:"TRAINER"};
const B={id:"trainerB",role:"TRAINER"};
const ADMIN={id:"adminZ",role:"ADMIN"};
let version=1;
let name="old";
const sqlCalls:{sql:string;args:unknown[]}[]=[];
function sqlRead(parts:TemplateStringsArray,...args:unknown[]){
  const sql=parts.join("?").replace(/\s+/g," ").trim();
  sqlCalls.push({sql,args});
  if(sql.startsWith("SELECT")) {
    const id=args[0];
    const owner=args[1];
    if(id!=="course1" || owner!==undefined && owner!=="trainerA")return [];
    return [{id:"course1",name,version}];
  }
  if(sql.startsWith("UPDATE")){
    const [newName,courseId,first,second]=args;
    const expected=second??first;
    const owner=second===undefined?undefined:first;
    if(courseId!=="course1" || expected!==version ||
       owner!==undefined&&owner!=="trainerA")return [];
    version++;
    name=newName as string;
    return [{id:"course1",name,version}];
  }
  throw Error("unexpected SQL");
}
beforeEach(()=>{
 vi.clearAllMocks();version=1;name="old";sqlCalls.length=0;
 m.query.mockImplementation(sqlRead);
 m.publish.mockResolvedValue(undefined);
});
describe("AG1 Course.version existing Core source CAS contract",()=>{
  it("owner-private version read returns integer, foreign read masked",async()=>{
    expect(await readCourseNameVersion("course1",A)).toEqual({
      status:"found",data:{id:"course1",name:"old",version:1},
    });
    expect(sqlCalls[0]?.sql).toContain('AND "authorId" = ?');
    expect(await readCourseNameVersion("course1",B)).toEqual({
      status:"not_found",
    });
    expect(m.publish).not.toHaveBeenCalled();
  });
  it("ADMIN version read does not add author predicate (server actor only)",async()=>{
    expect(await readCourseNameVersion("course1",ADMIN)).toEqual({
      status:"found",data:{id:"course1",name:"old",version:1},
    });
    expect(sqlCalls[0]?.sql).not.toContain('"authorId"');
  });
  it("owner CAS uses same UPDATE id+author+version, DB increments once",async()=>{
    expect(await updateCourseNameVersioned({
      courseId:"course1",name:"new",expectedVersion:1,
    },A)).toEqual({
      status:"updated",data:{id:"course1",name:"new",version:2},
    });
    expect(sqlCalls).toHaveLength(1);
    expect(sqlCalls[0]?.sql).toContain('UPDATE "Course" SET "name" = ?');
    expect(sqlCalls[0]?.sql).toContain('"authorId" = ?');
    expect(sqlCalls[0]?.sql).toContain('"version" = ?');
    expect(sqlCalls[0]?.sql).not.toContain('SET "version"');
    expect(sqlCalls[0]?.sql).toContain('RETURNING "id","name","version"');
    expect(m.invalidate).toHaveBeenCalledExactlyOnceWith("course1");
    expect(m.publish).toHaveBeenCalledOnce();
  });
  it("second editor stale version cannot mutate or publish",async()=>{
    await updateCourseNameVersioned({
      courseId:"course1",name:"winner",expectedVersion:1,
    },A);
    vi.clearAllMocks();sqlCalls.length=0;
    m.query.mockImplementation(sqlRead);
    expect(await updateCourseNameVersioned({
      courseId:"course1",name:"loser",expectedVersion:1,
    },A)).toEqual({status:"stale"});
    expect(name).toBe("winner");
    expect(version).toBe(2);
    expect(sqlCalls).toHaveLength(2);
    expect(m.invalidate).not.toHaveBeenCalled();
    expect(m.publish).not.toHaveBeenCalled();
  });
  it("foreign owner update returns not_found and never changes row",async()=>{
    expect(await updateCourseNameVersioned({
      courseId:"course1",name:"foreign",expectedVersion:1,
    },B)).toEqual({status:"not_found"});
    expect(version).toBe(1);
    expect(name).toBe("old");
    expect(m.publish).not.toHaveBeenCalled();
  });
  it("ADMIN CAS supports own verified privilege; no author SQL bypass from body",async()=>{
    expect(await updateCourseNameVersioned({
      courseId:"course1",name:"admin fix",expectedVersion:1,
    },ADMIN)).toEqual({
      status:"updated",data:{id:"course1",name:"admin fix",version:2},
    });
    expect(sqlCalls[0]?.sql).not.toContain('"authorId"');
  });
  it.each([
    {courseId:"course1",name:"bad",expectedVersion:0},
    {courseId:"course1",name:"bad",expectedVersion:1.5},
    {courseId:"course1",name:"bad",expectedVersion:2147483648},
    {courseId:"bad/course",name:"bad",expectedVersion:1},
    {courseId:"course1",name:"",expectedVersion:1},
  ])("invalid input %j fails before any query or side effect",async input=>{
    expect(await updateCourseNameVersioned(input,A)).toEqual({status:"invalid"});
    expect(m.query).not.toHaveBeenCalled();
    expect(m.publish).not.toHaveBeenCalled();
  });
  it("non trainer/admin actor fails without SQL or side effects",async()=>{
    expect(await updateCourseNameVersioned({
      courseId:"course1",name:"denied",expectedVersion:1,
    },{id:"user1",role:"USER"})).toEqual({status:"invalid"});
    expect(m.query).not.toHaveBeenCalled();
  });
  it("unknown DB failure is not a stale409 or replay",async()=>{
    m.query.mockRejectedValueOnce(Error("private SQL password"));
    expect(await updateCourseNameVersioned({
      courseId:"course1",name:"test",expectedVersion:1,
    },A)).toEqual({status:"unknown"});
    expect(m.invalidate).not.toHaveBeenCalled();
    expect(m.publish).not.toHaveBeenCalled();
  });
  it("postcommit notification failure leaves DB version advanced and reports unknown",async()=>{
    m.publish.mockRejectedValueOnce(Error("provider timeout"));
    expect(await updateCourseNameVersioned({
      courseId:"course1",name:"changed",expectedVersion:1,
    },A)).toEqual({status:"unknown"});
    expect(version).toBe(2);
    expect(name).toBe("changed");
    expect(m.invalidate).toHaveBeenCalledOnce();
    expect(m.publish).toHaveBeenCalledOnce();
  });
});
