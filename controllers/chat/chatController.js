import chatModel from "../../models/chat/chatModel.js";
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
        "-password -addressDetails -bankDetails -role -passwordResetToken -passwordResetTokenExpire"
      )
      .populate("latestMessage");

    isChat = await userModel.populate(isChat, {
      path: "latestMessage.sender",
      select: "name email number avatar isOnline status",
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
          "-password -addressDetails -bankDetails -role -passwordResetToken -passwordResetTokenExpire"
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
        "-password -addressDetails -bankDetails -role -passwordResetToken -passwordResetTokenExpire"
      )
      .populate("latestMessage")
      .sort({ updatedAt: -1 })
      .then(async (results) => {
        results = await userModel.populate(results, {
          path: "latestMessage.sender",
          select:
            "-password -addressDetails -bankDetails -role -passwordResetToken -passwordResetTokenExpire",
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
