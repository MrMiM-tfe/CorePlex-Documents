
import { ECoreMSG } from "@/core/messages/general";

export enum ECommentMSG {
    SUCCESS = "comment found successfully",
    SUCCESS_CREATE = "comment created successfully",
    SUCCESS_EDIT = "comment edited successfully",
    SUCCESS_DELETE = "comment deleted successfully",
    CAN_CREATE_COMMENT = "can not create comment",
    USER_NOT_FOUND = "user not found",
    COMMENT_NOT_FOUND = "comment not found",
    ARTICLE_NOT_FOUND = "article not found",
    EDITOR_NOT_FOUND = "editor not found",
    PARENT_NOT_FOUND = "parent not found",
    NO_PERMISSION = " no permission",
};

export type CommentMSG = ECommentMSG | ECoreMSG