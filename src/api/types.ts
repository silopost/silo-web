import type { components } from "./schema";

type Schemas = components["schemas"];

export type Account = Schemas["Account"];
export type Address = Schemas["Address"];
export type ContactSuggestion = Schemas["ContactSuggestion"];
export type Draft = Schemas["Draft"];
export type Label = Schemas["Label"];
export type Message = Schemas["Message"];
export type MessageAttachment = Schemas["MessageAttachment"];
export type OperationResult = Schemas["OperationResult"];
export type Participant = Schemas["Participant"];
export type SendResult = Schemas["SendResult"];
export type SearchSuggestion = Schemas["SearchSuggestion"];
export type Session = Schemas["SessionBody"];
export type SnoozePreset = Schemas["SnoozePreset"];
export type SnoozeResult = Schemas["SnoozeResult"];
export type SyncStatus = Schemas["SyncStatus"];
export type Thread = Schemas["Thread"];
export type ThreadDetail = Schemas["ThreadDetail"];
export type ThreadPage = Schemas["ThreadList"];
export type UploadInfo = Schemas["UploadInfo"];
