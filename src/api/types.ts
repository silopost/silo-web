import type { components } from "./schema";

type Schemas = components["schemas"];

export type Account = Schemas["Account"];
export type Address = Schemas["Address"];
export type Label = Schemas["Label"];
export type Message = Schemas["Message"];
export type MessageAttachment = Schemas["MessageAttachment"];
export type OperationResult = Schemas["OperationResult"];
export type Participant = Schemas["Participant"];
export type Session = Schemas["SessionBody"];
export type SyncStatus = Schemas["SyncStatus"];
export type Thread = Schemas["Thread"];
export type ThreadDetail = Schemas["ThreadDetail"];
export type ThreadPage = Schemas["ThreadList"];
