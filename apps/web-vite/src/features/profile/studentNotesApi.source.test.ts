import {beforeEach,describe,expect,it,vi} from "vitest";
import {getStudentNotes} from "./studentNotesApi";
const endpoint=vi.hoisted(()=>({call:vi.fn()}));
vi.mock("../../shared/api/client",()=>({
  apiRequest:endpoint.call,
  ApiError:class ApiError extends Error {
    constructor(public status:number,message:string){super(message);}
  },
}));
const iso="2026-10-25T00:00:00.000Z";
const notes=(fullName:string|null,username="trainer_owner")=>[{
  id:"WEB1-source-note",title:"Запись",tags:[],createdAt:iso,entries:[],
  trainer:{id:"WEB1-trainer",username,profile:{fullName}},
}];
beforeEach(()=>endpoint.call.mockReset());
describe("Source Next student notes trainer label preserves server-supplied spacing",()=>{
  it("preserves leading/trailing spaces for a genuine fullName",async()=>{
    endpoint.call.mockResolvedValue(notes("  Кинолог А  "));
    const result=await getStudentNotes();
    expect(result[0].trainerName).toBe("  Кинолог А  ");
    expect(endpoint.call).toHaveBeenCalledWith("/api/v1/notes/student",{
      method:"GET",browserAuth:true,expectedStatus:200,
    });
  });
  it("renders whitespace-only fullName exactly as truthy original Next",async()=>{
    endpoint.call.mockResolvedValue(notes("   "));
    expect((await getStudentNotes())[0].trainerName).toBe("   ");
  });
  it("falls back only when fullName is absent or empty",async()=>{
    endpoint.call.mockResolvedValue([...notes(""),...notes(null,"second-trainer")]);
    const result=await getStudentNotes();
    expect(result.map(n=>n.trainerName)).toEqual(["trainer_owner","second-trainer"]);
  });
});
