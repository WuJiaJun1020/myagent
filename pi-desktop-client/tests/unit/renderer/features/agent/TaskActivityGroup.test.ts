import {describe,expect,it} from "vitest";
import {groupActivityItems, type TaskActivityItem} from "../../../../../src/renderer/features/agent/TaskActivityGroup";
describe("process activity grouping",()=>{
 it("only merges adjacent tools without crossing commentary or thinking",()=>{
  const items:TaskActivityItem[]=[{type:"tool",toolId:"a"},{type:"tool",toolId:"b"},{type:"assistant",messageId:"m"},{type:"tool",toolId:"c"},{type:"final-thinking",messageId:"f"}];
  const original=JSON.stringify(items);
  expect(groupActivityItems(items)).toEqual([{type:"tools",toolIds:["a","b"]},{type:"assistant",messageId:"m"},{type:"tools",toolIds:["c"]},{type:"final-thinking",messageId:"f"}]);
  expect(JSON.stringify(items)).toBe(original);
 });
});
