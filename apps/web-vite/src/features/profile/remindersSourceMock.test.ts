import {describe,expect,it} from "vitest";
import {classifyReminderAck,daysOk,projectReminders,reminderPath,timeOk,
  tzOk,validateReminderChanges,validateReminderCreate,
  classifyReminderCreateAck,matchesNewReminder,classifyReminderDeleteAck,
  reminderListMatchesOperation,type TrainingReminder} from "./remindersSourceMock";
export const reminder:TrainingReminder={id:"rem1",name:"Утренняя тренировка",
  enabled:true,reminderTime:"09:00",reminderDays:"1,3,5",timezone:"Europe/Moscow"};
describe("AG2 existing Hono reminders DTO",()=>{
  it("R01 exact PUT path and no traversal",()=>{
    expect(reminderPath("rem1")).toBe("/api/v1/reminders/rem1");
    expect(()=>reminderPath("../admin")).toThrow();
  });
  it("R02 strips secret/private fields",()=>{
    const rows=projectReminders([{...reminder,userId:"SECRET_OWNER",
      token:"SECRET_TOKEN",endpoint:"SECRET_ENDPOINT"}]);
    expect(rows).toEqual([reminder]);
    expect(JSON.stringify(rows)).not.toContain("SECRET");
  });
  it("R03 empty, max5, duplicate IDs fail closed",()=>{
    expect(projectReminders([])).toEqual([]);
    expect(()=>projectReminders(Array.from({length:6},(_,i)=>({
      ...reminder,id:"id"+i,
    })))).toThrow();
    expect(()=>projectReminders([reminder,reminder])).toThrow();
  });
  it("R04 time/day/timezone contract",()=>{
    expect(timeOk("23:59")).toBe(true);
    expect(timeOk("24:00")).toBe(false);
    expect(daysOk(null)).toBe(true);
    expect(daysOk("1,3,5")).toBe(true);
    expect(daysOk("1,1")).toBe(false);
    expect(tzOk("Europe/Moscow")).toBe(true);
    expect(tzOk("Secret/False")).toBe(false);
  });
  it("R05 partial update only changed fields",()=>{
    expect(validateReminderChanges(reminder,{
      ...reminder,enabled:false,reminderTime:"11:15",
    })).toEqual({ok:true,changes:{enabled:false,reminderTime:"11:15"}});
    expect(validateReminderChanges(reminder,reminder).ok).toBe(false);
  });
  it("R06 invalid name/days/tz/time",()=>{
    for(const p of [{name:" "},{name:"X".repeat(101)},
      {reminderDays:"1,8"},{timezone:"bad"},
      {reminderTime:"88:88"}])
      expect(validateReminderChanges(reminder,{...reminder,...p}).ok).toBe(false);
  });
  it("R07 matching 200 synthetic ACK, foreign unknown",()=>{
    expect(classifyReminderAck({httpStatus:200,success:true,
      data:{...reminder,enabled:false}},reminder.id,{enabled:false}))
      .toEqual({kind:"ACK_MOCK"});
    expect(classifyReminderAck({httpStatus:200,success:true,
      data:{...reminder,id:"foreign",enabled:false}},reminder.id,{enabled:false}))
      .toEqual({kind:"UNKNOWN"});
  });
  it("R08 4xx reject, 5xx/lostACK unknown",()=>{
    for(const status of [400,401,403,404,409,422,429])
      expect(classifyReminderAck({httpStatus:status,success:false},
        reminder.id,{enabled:false})).toEqual({kind:"REJECTED",status});
    for(const status of [500,503])
      expect(classifyReminderAck({httpStatus:status,success:false},
        reminder.id,{enabled:false})).toEqual({kind:"UNKNOWN"});
    expect(classifyReminderAck(null,reminder.id,{enabled:false}))
      .toEqual({kind:"UNKNOWN"});
  });
  it("R09 creation shape and Hono 200/201 strict DTO ACK",()=>{
    const newBody={name:"Вечером",reminderTime:"20:15",
      reminderDays:null,timezone:"Europe/Moscow"};
    expect(validateReminderCreate({...newBody,name:" Вечером "})).toEqual({
      ok:true,body:newBody,
    });
    expect(validateReminderCreate({...newBody,reminderTime:"25:12"}).ok).toBe(false);
    expect(validateReminderCreate({...newBody,reminderDays:"1,1"}).ok).toBe(false);
    expect(validateReminderCreate({...newBody,timezone:"INVALID_ZONE"}).ok).toBe(false);
    for(const code of [200,201])
      expect(classifyReminderCreateAck({httpStatus:code,success:true,
        data:{...newBody,id:"created01",enabled:true}},newBody))
        .toEqual({kind:"ACK_MOCK"});
    expect(matchesNewReminder({...newBody,id:"created01",enabled:true,
      ownerToken:"PRIVATE"},newBody)).toBe(true);
    expect(classifyReminderCreateAck({httpStatus:200,success:true,
      data:{...newBody,id:"created01",enabled:true,name:"other"}},newBody))
      .toEqual({kind:"UNKNOWN"});
    expect(classifyReminderCreateAck({httpStatus:403,success:false},newBody))
      .toEqual({kind:"REJECTED",status:403});
    expect(classifyReminderCreateAck({httpStatus:503,success:false},newBody))
      .toEqual({kind:"UNKNOWN"});
  });  it("R10 Hono DELETE success envelope has no data; status strict",()=>{
    expect(classifyReminderDeleteAck({httpStatus:200,success:true}))
      .toEqual({kind:"ACK_MOCK"});
    expect(classifyReminderDeleteAck({httpStatus:204,success:true}))
      .toEqual({kind:"UNKNOWN"});
    for(const code of [400,401,403,404,409,422,429])
      expect(classifyReminderDeleteAck({httpStatus:code,success:false}))
        .toEqual({kind:"REJECTED",status:code});
    expect(classifyReminderDeleteAck({httpStatus:503,success:false}))
      .toEqual({kind:"UNKNOWN"});
    expect(classifyReminderDeleteAck(null)).toEqual({kind:"UNKNOWN"});
  });
  it("R11 readback operation validates selected ID, update changes, delete absence",()=>{
    expect(reminderListMatchesOperation([reminder],"rem1","update",{enabled:true}))
      .toBe(true);
    expect(reminderListMatchesOperation([reminder],"rem1","toggle",{enabled:false}))
      .toBe(false);
    expect(reminderListMatchesOperation([reminder],"other","delete",null))
      .toBe(true);
    expect(reminderListMatchesOperation([reminder],"rem1","delete",null))
      .toBe(false);
    expect(reminderListMatchesOperation([],"rem1","delete",null))
      .toBe(true);
  });
  it("R12 day-of-week is not a scheduled calendar date",()=>{
    expect(daysOk("1,2,3,4,5,6,7")).toBe(true);
    expect(daysOk("2026-10-18")).toBe(false);
    expect(timeOk("23:59")).toBe(true);
    expect(timeOk("24:00")).toBe(false);
    expect(tzOk("Europe/Amsterdam")).toBe(true);
  });

});
