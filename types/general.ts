import { IResultType } from "@/core/types/general";
import { ERole } from "@/core/types/user";
import { IndexDefinition, SchemaDefinitionProperty, Types } from "mongoose";
import { DocumentMSG } from "../messages/document";
import { TypedResult } from "@/core/types/Result";
import { CommentMSG } from "../messages/comment";
import { CategoryMSG } from "../messages/category";

export interface IDocOptions {
    docName: string;
    databaseSchema: TMongooseSchema;
    slugBase?: string;
    permissions?: {
        read?: ERole;
        write?: ERole;
        advance?: {
            getAll?: ERole;
            getOne?: ERole;
            create?: ERole;
            edit?: {
                role:ERole,
                public:boolean
            };
            delete?: {
                role:ERole,
                public:boolean
            };
            getDrafts?: {
                role:ERole,
                public:boolean
            };
        };
    };
    sortFields?: string[];
    options?: {
        private_option?: boolean;
        variable_data?: boolean;
    };
    comments?: {
        enabled: boolean;
        canWrite: ERole;
        needToVerify: boolean;
        canVerify: {role: ERole, public:boolean};
        canMange: ERole
    };
    category?: {
        enabled: boolean;
        permissions?: {
            read?: ERole;
            write?: ERole;
            advance?: {
                getAll?: ERole;
                getAllAndDocs?: ERole;
                getOne?: ERole;
                create?: ERole;
                use?: {role: ERole, public:boolean};
                edit?: {role: ERole, public:boolean};
                delete?: {role: ERole, public:boolean};
            };
        };
    };
    indexing?: IndexDefinition[];
    searchOn?: string[];
}

export type TMongooseSchema = Record<string, SchemaDefinitionProperty<any>>

export enum EStates {
    PUBLISHED = "published",
    DRAFT = "draft",
}

export interface IDocumentResult<IModel> extends IResultType {
    data?:IModel,
    message?:DocumentMSG | CommentMSG | CategoryMSG
}

export class DocumentResult<IModel> extends TypedResult<IDocumentResult<IModel>, IModel, DocumentMSG | CommentMSG | CategoryMSG> {}

// comments ---------------
export interface ICommentFilter {
    user?:string,
    state?:string,
    article?:string
}

export enum ECommentState {
    ACCEPTED = "accepted",
    REJECTED = "rejected",
    WAITING = "waiting",
    PARENT_DELETED = "parent_deleted",
}

export interface IPreComment {
    title:string,
    body:string,
    document:string,
    user?:string,
    parent?:string,
}

export interface IComment extends IPreComment{
    _id: Types.ObjectId
    state: ECommentState,
    children?: IComment[]
}

export interface IOptComment extends Partial<Omit<IComment, "document" | "user">> {}
