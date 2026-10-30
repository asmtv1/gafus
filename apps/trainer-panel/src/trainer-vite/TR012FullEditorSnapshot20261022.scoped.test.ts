import {describe,it,expect} from 'vitest';
import {parseVersionedCourseEditorSnapshot} from './trainerCourseDraftReadContract';
const draft={id:'course-1',name:'Course',guideContent:null,shortDesc:'',description:'',duration:'10 min',videoUrl:null,logoImg:'',isPrivate:false,isPaid:false,showInProfile:true,isPersonalized:false,equipment:'',trainingLevel:'BEGINNER',dayLinks:[],access:[]};
describe('TR012 atomic full-editor snapshot freeze: no split version/draft',()=>{
 it('accepts only one complete same-course snapshot including positive PG integer version',()=>{
  expect(parseVersionedCourseEditorSnapshot({success:true,data:{...draft,version:2}},'course-1').version).toBe(2);
  expect(()=>parseVersionedCourseEditorSnapshot({success:true,data:draft},'course-1')).toThrow();
 });
 it('rejects stale field/identity joins and invalid version0 or overflow',()=>{
  for(const version of [0,2147483648])expect(()=>parseVersionedCourseEditorSnapshot({success:true,data:{...draft,version}},'course-1')).toThrow();
  expect(()=>parseVersionedCourseEditorSnapshot({success:true,data:{...draft,version:1}},'other')).toThrow();
  expect(()=>parseVersionedCourseEditorSnapshot({success:true,data:{...draft,version:1,secret:'PRIVATE'}},'course-1')).toThrow();
 });
});
