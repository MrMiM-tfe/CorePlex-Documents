
import { ECoreMSG } from "@/core/messages/general";

export enum ECategoryMSG {
    SUCCESS = "category found successfully",
    SUCCESS_CREATE = "category created successfully",
    SUCCESS_EDIT = "category edited successfully",
    SUCCESS_DELETE = "category deleted successfully",
    CAN_CREATE_CATEGORY = "can not create category",
    USER_NOT_FOUND = "user not found",
    CATEGORY_NOT_FOUND = "category not found",
    EDITOR_NOT_FOUND = "editor not found",
    NO_PERMISSION = " no permission",

};

export type CategoryMSG = ECategoryMSG | ECoreMSG