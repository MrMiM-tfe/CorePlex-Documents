import { ECoreMSG } from "@/core/messages/general";

export enum EDocumentMSG {
    SUCCESS = "Document found successfully",
    SUCCESS_CREATE = "Document created successfully",
    SUCCESS_EDIT = "Document edited successfully",
    SUCCESS_DELETE = "Document deleted successfully",
    CAN_CREATE_DOCUMENT = "can not create Document",
    USER_NOT_FOUND = "user not found",
    AUTHOR_NOT_FOUND = "author not found",
    DOCUMENT_NOT_FOUND = "Document not found",
    EDITOR_NOT_FOUND = "editor not found",
    NO_PERMISSION = " no permission",
    NEW_AUTHOR_IS_NOT_VALID = "new author do not have permission to have document"
};

export type DocumentMSG = EDocumentMSG | ECoreMSG