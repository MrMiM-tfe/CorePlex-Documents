import mongoose, { Model } from "mongoose";
import User from "@/core/models/User";
import { DocumentResult, EStates, IComment, IPreComment, IDocOptions, IDocumentResult, ECommentState, ICommentFilter } from "./types/general";
import { ERole } from "@/core/types/user";
import { ConvertToNaturalNumber, GenerateSlug, findDocByIdentity, getPageData, handleModelErrors } from "@/core/helpers/general";
import { permissionsCheck } from "@/core/helpers/auth";
import { EResultTypes, EStatusCodes } from "@/core/types/general";
import { EDocumentMSG } from "./messages/document";
import { ECommentMSG } from "./messages/comment";


export default class Doc<IPreModel,IModel> {
  document: IDocOptions;
  Model: Model<any>;
  CommentModel?: Model<any>;
  CategoryModel?: Model<any>;
  result: DocumentResult<IModel>;
  commentResult : DocumentResult<IComment>;

  constructor(document: IDocOptions) {
    // processing permissions
    document.permissions = {
      ...document.permissions,
      advance: {
        getAll: document.permissions?.advance?.getAll ?? document.permissions?.read ?? ERole.GEST,
        getOne: document.permissions?.advance?.getOne ?? document.permissions?.read ?? ERole.GEST,
        create: document.permissions?.advance?.create ?? document.permissions?.write ?? ERole.SELLER,
        edit: document.permissions?.advance?.edit ?? {
          role: document.permissions?.write ?? ERole.SELLER,
          public: true
        },
        delete: document.permissions?.advance?.delete ?? {
          role: document.permissions?.write ?? ERole.SELLER,
          public: false
        },
        getDrafts: document.permissions?.advance?.getDrafts ?? {
          role: document.permissions?.write ?? ERole.SELLER,
          public: true
        },
      },
    };

    this.result = new DocumentResult<IModel>();
    this.commentResult = new DocumentResult<IComment>();
    this.document = document;

    this.Model = this.createModel(document);

    if (document.comments?.enabled) {
      this.CommentModel = this.createCommentsModel(document);
    }

    if (document.category?.enabled) {
      this.CategoryModel = this.createCategoryModel(document);
    }
  }


  private createModel(document: IDocOptions) {
    document.databaseSchema = {
      ...document.databaseSchema,
      state: {
        type: String,
        enum: Object.values(EStates),
        required: true,
        default: EStates.PUBLISHED,
      },
    };

    // add slug
    if (document.slugBase) {
      document.databaseSchema = {
        ...document.databaseSchema,
        slug: {
          type: String,
          unique: true,
        },
      };
    }

    // add category
    if (document.category?.enabled) {
      document.databaseSchema = {
        ...document.databaseSchema,
        categories: {
          type: [mongoose.Types.ObjectId],
          ref: document.docName + "_Category",
        },
      };
    }

    // add authorId if document need user registration (gests can't create document)
    if (document.permissions?.advance?.create !== ERole.GEST) {
      document.databaseSchema = {
        ...document.databaseSchema,
        authorId: {
          type: mongoose.Types.ObjectId,
          ref: "User",
        },
      };
    }

    // create schema
    const schema = new mongoose.Schema(document.databaseSchema,{ timestamps:true });

    if (document.slugBase) {
      schema.pre("save", async function (this: any, next: Function) {        
        this.slug = await GenerateSlug(this, mongoose.models[document.docName])
        next()
      })
    }

    // add indexes
    document.indexing?.map((index) => schema.index(index));

    // add comments virtual
    if (document.comments?.enabled) {
      schema.virtual("comments", {
        ref: document.docName + "_Comment",
        foreignField: document.docName.toLowerCase(),
        localField: "_id",
      });
    }

    // add author virtual
    if (document.permissions?.advance?.create !== ERole.GEST) {
      schema.virtual("author", {
        ref: "User",
        foreignField: "_id",
        localField: "authorId",
        justOne: true,
      });
    }

    return mongoose.model<IModel>(document.docName, schema);
  }

  private createCommentsModel(document: IDocOptions) {
    const schema = new mongoose.Schema(
      {
        title: {
          type: String,
          required: true,
        },
        body: {
          type: String,
          required: true,
        },
        document: {
          type: mongoose.Types.ObjectId,
          ref: document.docName,
          required: true,
        },
        user: {
          type: mongoose.Types.ObjectId,
          ref: "User",
          required: document.comments?.canWrite !== ERole.GEST,
        },
        parent: {
          type: mongoose.Types.ObjectId,
          ref: document.docName + "_Comment",
        },
        state: {
          type: String,
          enum: ["accepted", "waiting", "rejected", "parent_deleted"],
          default: document.comments?.needToVerify ? "waiting" : "accepted",
        },
      },
      {
        timestamps: true,
      }
    );

    // add index
    schema.index({ [document.docName.toLowerCase()]: 1, user: 1 });

    // add virtual for replies
    schema.virtual("children", {
      ref: document.docName + "_Comment",
      localField: "_id",
      foreignField: "parent",
    });

    return mongoose.model<IComment>(document.docName + "_Comment", schema);
  }

  private createCategoryModel(document: IDocOptions) {
    // create schema
    const schema = new mongoose.Schema(
      {
        name: {
          type: String,
          required: true,
        },
        slug: {
          type: String,
          unique: true,
        },
        mother: {
          type: mongoose.Types.ObjectId,
          ref: document.docName + "_Category",
        },
        des: {
          type: String,
        },
      },
      {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
      }
    );

    schema.pre("save",async function (this: any, next: Function) {
      this.slug = await GenerateSlug(this, mongoose.models[document.docName + "_Category"])
      next()
    })

    schema.index({ slug: 1 });

    // add document(s) virtual
    schema.virtual(document.docName.toLowerCase() + "s", {
      ref: document.docName,
      foreignField: "categories",
      localField: "_id",
    });

    return mongoose.model(document.docName + "_Category", schema);
  }


  async getAll(page: number, limit: number, { sort = ["-createdAt"], userId }: { sort?: string[]; userId?: string }) {
    let user = null;
    // check to see who can get all documents
    if (this.document.permissions?.advance?.getAll !== ERole.GEST) {
      if (!userId) return this.result.singleError("user", EDocumentMSG.USER_NOT_FOUND);

      user = await User.findById(userId);

      // if user don't have perm return error
      if (!permissionsCheck(this.document.permissions?.advance?.getAll, user?.role)) {
        return this, this.result.singleError("user", EDocumentMSG.NO_PERMISSION);
      }
    }

    // validate page and limit
    page = ConvertToNaturalNumber(page);
    limit = ConvertToNaturalNumber(limit);

    // generate skip
    const skip = (page - 1) * limit;

    // generate filter object for mongoose
    let filter: { state?: EStates } = {
      state: EStates.PUBLISHED,
    };

    // check to see how can see drafts
    if (this.document.permissions?.advance?.getDrafts?.role === ERole.GEST) {
      filter = {};
    } else if (userId) {
      if (!user) user = await User.findById(userId);
      if (permissionsCheck(this.document.permissions?.advance?.getDrafts?.role, user?.role)) {
        filter = {};
      }
    }

    try {
      // get document
      const doc = await this.Model.find(filter).sort(sort.join(" ")).skip(skip).limit(limit);

      // get total number of documents
      const totalArticles = await this.Model.countDocuments(filter);

      // get page data
      const pageData = getPageData(page, limit, totalArticles);

      // create result
      const result: IDocumentResult<IModel> = {
        status: 200,
        type: EResultTypes.SUCCESS,
        data: doc as IModel,
        pageData,
      };

      return result;
    } catch (error) {
      return handleModelErrors(error);
    }
  }

  async getOne(identity: string, userId?: string) {
    // check to see who can get document
    if (this.document.permissions?.advance?.getOne !== ERole.GEST) {
      if (!userId) return this.result.singleError("user", EDocumentMSG.USER_NOT_FOUND);

      const user = await User.findById(userId);

      // if user don't have perm return error
      if (!permissionsCheck(this.document.permissions?.advance?.getOne, user?.role)) {
        return this, this.result.singleError("user", EDocumentMSG.NO_PERMISSION);
      }
    }

    const doc = await findDocByIdentity(identity, this.Model)
    if (!doc) return this.result.singleError("document", EDocumentMSG.DOCUMENT_NOT_FOUND, EStatusCodes.NOT_FOUND)

    return this.result.success(doc, EDocumentMSG.SUCCESS)
  }

  async create(data: IPreModel, authorId?: string) {
    // check permissions needed to create
    if (this.document.permissions?.advance?.create !== ERole.GEST) {
      if (!authorId) return this.result.singleError("user", EDocumentMSG.AUTHOR_NOT_FOUND)

      const user = await User.findById(authorId)
      if (!user) return this.result.singleError("user", EDocumentMSG.AUTHOR_NOT_FOUND)

      if (!permissionsCheck(this.document.permissions?.advance?.create, user.role)) {
        return this.result.singleError("user", EDocumentMSG.NO_PERMISSION)
      }
    }

    try {
      // save document to DB
      const doc = await this.Model.create(data);

      return this.result.success(doc, EDocumentMSG.SUCCESS_CREATE, EStatusCodes.SUCCESS_CREATE)
    } catch (error) {
      return handleModelErrors(error)
    }
  }

  async edit(identity: string, data: Partial<IModel>, editorId?: string) {
    const permissions = this.document.permissions?.advance?.edit

    // get document and check if exist
    const document = await findDocByIdentity(identity, this.Model)
    if (!document) return this.result.singleError("document", EDocumentMSG.DOCUMENT_NOT_FOUND)

    // check if user needed
    let user = null
    if (permissions?.role !== ERole.GEST || !permissions?.public) {
      user = await User.findById(editorId)
      // // check if editor exist
      if (!user) return this.result.singleError("user", EDocumentMSG.USER_NOT_FOUND)
    }

    // check edit permission
    if (permissions?.role !== ERole.GEST) {
      if (!permissionsCheck(permissions?.role, user?.role)) {
        return this.result.singleError("user", EDocumentMSG.NO_PERMISSION)
      }
    }

    // check to see if other users with perm can edit other's document    
    if (!permissions?.public && document.authorId !== user?.id) {
      return this.result.singleError("user", EDocumentMSG.NO_PERMISSION)
    }

    // check if document author changed author
    if ('authorId' in data) {
      // check if new document author exist
      const newAuthor = await User.findById(data.authorId)
      if (!newAuthor) return this.result.singleError("new_author", EDocumentMSG.USER_NOT_FOUND, EStatusCodes.NOT_FOUND)

      // check if new author has perm
      if (!permissionsCheck(this.document.permissions?.advance?.create, newAuthor?.role)) {
        return this.result.singleError("new_author", EDocumentMSG.NEW_AUTHOR_IS_NOT_VALID)
      }
    }

    try {
      // save new data to DB
      const newDoc = await this.Model.findByIdAndUpdate(document.id, data)

      return this.result.success(newDoc, EDocumentMSG.SUCCESS_EDIT, EStatusCodes.SUCCESS_CREATE)
    } catch (error) {
      return handleModelErrors(error)
    }
  }

  async delete(identity: string, userId?: String) {
    const permissions = this.document.permissions?.advance?.delete

    // check if document exit
    const document = await findDocByIdentity(identity, this.Model)
    if (!document) return this.result.singleError("document", EDocumentMSG.DOCUMENT_NOT_FOUND)

    // check if user needed
    let user = null
    if (permissions?.role !== ERole.GEST || !permissions?.public) {
      user = await User.findById(userId)
      // // check if editor exist
      if (!user) return this.result.singleError("user", EDocumentMSG.USER_NOT_FOUND)
    }

    if (permissions?.role !== ERole.GEST) {
      // check the permissions
      if (!permissionsCheck(permissions?.role, user?.role)) {
        return this.result.singleError("user", EDocumentMSG.NO_PERMISSION)
      }
    }

    // check to see if other users with perm can delete other's document    
    if (!permissions?.public && document.authorId !== user?.id) {
      return this.result.singleError("user", EDocumentMSG.NO_PERMISSION)
    }

    try {
      // delete document from DB
      await this.Model.deleteOne()

      return this.result.success(document, EDocumentMSG.SUCCESS_DELETE, EStatusCodes.SUCCESS)
    } catch (error) {
      return handleModelErrors(error)
    }
  }


  Comment = {
    // get one comment
    getComment: async (id: string) => {
      if(!this.CommentModel || !this.document.comments?.enabled) return new Error("comments are disabled")
      // get comment
      const comment = await this.Model.findById(id).populate("children")
      if (!comment) return this.commentResult.singleError("comment", ECommentMSG.COMMENT_NOT_FOUND, EStatusCodes.NOT_FOUND)
  
      return this.commentResult.success(comment, ECommentMSG.SUCCESS, EStatusCodes.SUCCESS)
    },

    // get single document comments
    getDocumentComments: async (identity:string, page:number, limit:number) => {
      if(!this.CommentModel || !this.document.comments?.enabled) return new Error("comments are disabled")

      // validate page and limit
      page = ConvertToNaturalNumber(page);
      limit = ConvertToNaturalNumber(limit);
  
      // generate skip
      const skip = (page - 1) * limit;
  
      // get document and create filter obj
      const document = await findDocByIdentity(identity, this.CommentModel)
      if (!document) return this.commentResult.singleError("article", ECommentMSG.ARTICLE_NOT_FOUND, EStatusCodes.NOT_FOUND)
      const filter = {article: document._id?.toString() as string, state: ECommentState.ACCEPTED}
  
      try {
          // get comments
          const comments = await this.CommentModel.find(filter).populate("children").skip(skip).limit(limit)
  
          // get total number of comments base on filter
          const totalComments = await this.CommentModel.countDocuments(filter);
  
          // get page data
          const pageData = getPageData(page, limit, totalComments);
  
          // create result
          const res: IDocumentResult<IComment[]> = {
              type: EResultTypes.SUCCESS,
              status: EStatusCodes.SUCCESS,
              data: comments as IComment[],
              pageData,
          }
  
          return res
      } catch (error) {
          return handleModelErrors(error);
      }
    },

    // get all comments
    getComments: async (page: number, limit: number, { filter, sort }: { filter: ICommentFilter; sort: string } = { filter: {}, sort: "-createdAt" }) => {
      if(!this.CommentModel || !this.document.comments?.enabled) return new Error("comments are disabled")
      // validate page and limit
      page = ConvertToNaturalNumber(page);
      limit = ConvertToNaturalNumber(limit);
  
      // generate skip
      const skip = (page - 1) * limit;
  
      try {
          // get comments
          const comments = await this.CommentModel.find(filter).skip(skip).limit(limit).sort(sort);
  
          // get total number of comments base on filter
          const totalComments = await this.CommentModel.countDocuments(filter);
  
          // get page data
          const pageData = getPageData(page, limit, totalComments);
  
          // create result
          const res: IDocumentResult<IComment[]> = {
              type: EResultTypes.SUCCESS,
              status: EStatusCodes.SUCCESS,
              data: comments as IComment[],
              pageData,
          }
  
          return res
      } catch (error) {
          return handleModelErrors(error);
      }
    },

    // create new comment
    newComment: async (data: IPreComment, userId: string) => {
      if(!this.CommentModel || !this.document.comments?.enabled) return new Error("comments are disabled")
      // check user id
      const user = await User.findById(userId);
      if (!user) return this.commentResult.singleError("user", ECommentMSG.USER_NOT_FOUND, EStatusCodes.CONFLICT);
  
      // set user for creating comment
      data.user = user._id.toString();
  
      try {
          const comment = await this.CommentModel.create(data);
  
          return this.commentResult.success(comment, ECommentMSG.SUCCESS_CREATE, EStatusCodes.SUCCESS_CREATE);
      } catch (error) {
          return handleModelErrors(error);
      }
    },

    // edit comment
    editComment: async (commentId: string, data: Partial<IComment>, editorId: string) => {
      if(!this.CommentModel || !this.document.comments?.enabled) return new Error("comments are disabled")

      // check if user exist
      const user = await User.findById(editorId);
      if (!user) return this.commentResult.singleError("user", ECommentMSG.USER_NOT_FOUND, EStatusCodes.CONFLICT);
  
      // check user if user is not seller then set state to waiting
      if (!permissionsCheck(this.document.comments.canVerify.role, user.role)) {
          // clear state
          data.state = ECommentState.WAITING;
      }
  
      try {
          const newComment = await this.CommentModel.findByIdAndUpdate(commentId, data, { new: true });
  
          // check if comment exist
          if (!newComment) return this.commentResult.singleError("commentId", ECommentMSG.COMMENT_NOT_FOUND, EStatusCodes.NOT_FOUND);
  
          return this.commentResult.success(newComment, ECommentMSG.SUCCESS_EDIT, EStatusCodes.SUCCESS);
      } catch (error) {
          return handleModelErrors(error);
      }
    },

    // delete comments
    deleteComment: async (commentId: string, editorId: string) => {
      if(!this.CommentModel || !this.document.comments?.enabled) return new Error("comments are disabled")
      
      // check if user exist
      const user = await User.findById(editorId);
      if (!user) return this.commentResult.singleError("user", ECommentMSG.USER_NOT_FOUND, EStatusCodes.CONFLICT);
  
      const comment = await this.CommentModel.findById(commentId).populate("children");
  
      // check if comment exist
      if (!comment) return this.commentResult.singleError("commentId", ECommentMSG.COMMENT_NOT_FOUND, EStatusCodes.NOT_FOUND);
  
      // check editor permission
      if (user._id.toString() !== comment.user && !permissionsCheck(this.document.comments.canMange, user.role)) {
          this.commentResult.singleError("editor", ECommentMSG.NO_PERMISSION, EStatusCodes.FORBIDDEN);
      }
  
      try {
          // delete comment from db
          await comment.deleteOne();
  
          // change state of all comment children
          if (comment.children) {
              for (const child of comment.children) {
                  await this.CommentModel.findByIdAndUpdate(child._id, {state: ECommentState.PARENT_DELETED})
              }
          }
  
          return this.commentResult.success(comment, ECommentMSG.SUCCESS_DELETE, EStatusCodes.SUCCESS);
      } catch (error) {
          return handleModelErrors(error);
      }
    }
  }
}
