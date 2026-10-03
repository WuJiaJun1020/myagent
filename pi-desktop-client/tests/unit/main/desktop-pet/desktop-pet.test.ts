import { describe,it,expect } from "vitest";
import { parsePetPatch,petFrameAtElapsed } from "../../../../src/shared/contracts/desktop-pet";
describe("desktop pet",()=>{
 it("accepts independent controls without accepting paths or arbitrary position patches",()=>{
  expect(parsePetPatch({enabled:true,action:"chess",scale:1})).toEqual({enabled:true,action:"chess",scale:1});
  expect(parsePetPatch({scale:.01})).toEqual({scale:.01});
  for(const bad of [{action:"../reading"},{scale:NaN},{scale:1.01},{scale:0},{enabled:"true"},{paused:true},{file:"c:/private"},{scales:{reading:1}},{position:{x:1,y:1}},null])expect(()=>parsePetPatch(bad)).toThrow();
 });
 it("preserves irregular durations and holds the last frame for completed actions",()=>{
  const frames=[{file:"01.png",durationMs:550},{file:"02.png",durationMs:240},{file:"03.png",durationMs:1100}];
  expect(petFrameAtElapsed(frames,549,true)).toEqual({index:0,finished:false});expect(petFrameAtElapsed(frames,550,true)).toEqual({index:1,finished:false});expect(petFrameAtElapsed(frames,1890,true)).toEqual({index:0,finished:false});expect(petFrameAtElapsed(frames,2000,false)).toEqual({index:2,finished:true});
 });
});
