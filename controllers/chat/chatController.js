import chatModel from "../../models/chat/chatModel.js";
import projectModel from "../../models/projectModel.js";
import userModel from "../../models/userModel.js";

// Create Chat
export const createChat = async (req, res) => {
  try {
    const { userId } = req.body;

    console.log(req.user._id);

    if (!userId) {
      return res.status(400).send({
        success: false,
        message: "User id is required!",
      });
    }

    // Existing Chat
    let isChat = await chatModel
      .find({
        $and: [
          { users: { $elemMatch: { $eq: req.user._id } } },
          { users: { $elemMatch: { $eq: userId } } },
        ],
      })
      .populate(
        "users",
        "-password -reviews -role -passwordResetToken -passwordResetTokenExpire"
      )
      .populate("latestMessage");

    isChat = await userModel.populate(isChat, {
      path: "latestMessage.sender",
      select: "name email profileImage isOnline status",
    });

    if (isChat.length > 0) {
      return res.send(isChat[0]);
    } else {
      var chatData = {
        chatName: "sender",
        users: [req.user._id, userId],
      };

      const createdChat = await chatModel.create(chatData);

      const fullChat = await chatModel
        .findById({ _id: createdChat._id })
        .populate(
          "users",
          "-password -reviews -role -passwordResetToken -passwordResetTokenExpire"
        );

      res.status(200).send({
        success: true,
        message: "Chat created successfully!",
        fullChat: fullChat,
      });
    }
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Error occured while create chat, please try again!",
      error: error,
    });
  }
};

// Fetch Chat
export const fetchChats = async (req, res) => {
  try {
    const userId = req.params.id;

    if (!userId) {
      return res
        .status(400)
        .send({ success: false, message: "User id is required!" });
    }

    await chatModel
      .find({ users: { $elemMatch: { $eq: userId } } })
      .populate(
        "users",
        "-password -reviews -role -passwordResetToken -passwordResetTokenExpire -followRequests"
      )
      .populate("latestMessage")
      .sort({ updatedAt: -1 })
      .then(async (results) => {
        results = await userModel.populate(results, {
          path: "latestMessage.sender",
          select:
            "-password -reviews -role -passwordResetToken -followRequests -passwordResetTokenExpire",
        });
        res.status(200).send({
          results: results,
        });
      });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Error occur while fetch chat, please try again!",
      error: "error",
    });
  }
};
// Fetch All Chats - For Admin
export const fetchAllChats = async (req, res) => {
  try {
    await chatModel
      .find({})
      .populate(
        "users",
        "-password -reviews -role -passwordResetToken -passwordResetTokenExpire -followRequests"
      )
      .populate("latestMessage")
      .sort({ updatedAt: -1 })
      .then(async (results) => {
        results = await userModel.populate(results, {
          path: "latestMessage.sender",
          select:
            "-password -reviews -role -passwordResetToken -followRequests -passwordResetTokenExpire",
        });
        res.status(200).send({
          results: results,
        });
      });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Error occur while fetch chat, please try again!",
      error: "error",
    });
  }
};

// Delete Chat
export const deleteChat = async (req, res) => {
  try {
    const chatId = req.params.id;

    if (!chatId) {
      res.status(400).send({
        success: false,
        message: "Chat id is required!",
      });
    }

    await chatModel.findByIdAndDelete(chatId);

    res.status(200).send({
      success: false,
      message: "Chat Deleted!",
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Error occur while delete chat, please try again!",
      error: error,
    });
  }
};

// Create Group Chat
export const createGroupChat = async (req, res) => {
  try {
    const { userId, chatName, avatar, projectId } = req.body;

    const isExisting = await chatModel.findOne({
      projectId: projectId,
      isGroupChat: true,
    });

    if (isExisting) {
      // Populate the existing chat for consistent response
      const populatedChat = await chatModel
        .findById(isExisting._id)
        .populate("users", "name email profileImage isOnline status")
        .populate("groupAdmin", "name email profileImage isOnline status");

      if (isExisting.users.includes(userId)) {
        // User is already in the chat, just return it
        return res.status(200).json({
          success: true,
          message: "Chat already exists",
          _id: populatedChat._id,
          groupChat: populatedChat,
        });
      }

      // Add user to the existing group chat
      isExisting.users.push(userId);
      await isExisting.save();

      const updatedChat = await chatModel
        .findById(isExisting._id)
        .populate("users", "name email profileImage isOnline status")
        .populate("groupAdmin", "name email profileImage isOnline status");

      return res.status(200).json({
        success: true,
        message: "User added to the existing group chat successfully!",
        _id: updatedChat._id,
        groupChat: updatedChat,
      });
    }

    const project = await projectModel.findById(projectId);

    if (!project) {
      return res.status(400).json({
        success: false,
        message: "Project not found!",
      });
    }

    const groupChat = await chatModel.create({
      chatName: chatName,
      users: [userId],
      groupAdmin: project.user,
      isGroupChat: true,
      avatar: avatar,
      projectId: projectId,
    });

    const fullGroupChat = await chatModel
      .findById({ _id: groupChat._id })
      .populate("users", "name email profileImage isOnline status")
      .populate("groupAdmin", "name email profileImage isOnline status");

    res.status(200).send({
      success: true,
      message: "Group chat created successfully!",
      _id: fullGroupChat._id,
      groupChat: fullGroupChat,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Error occur while create group chat, please try again!",
      error: error,
    });
  }
};

//
