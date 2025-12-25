import chatModel from "../../models/chat/chatModel.js";
import messagesModel from "../../models/chat/messagesModel.js";
import userModel from "../../models/userModel.js";
import notificationModel from "../../models/notificationModel.js";
import projectModel from "../../models/projectModel.js";

// Create Message
export const sendMessage = async (req, res) => {
  try {
    const { content, chatId, contentType, products } = req.body;
    if (!chatId || !contentType) {
      return res
        .status(400)
        .json({ message: "Invalid data passed into request" });
    }

    const newMessage = {
      sender: req.user._id,
      content: content || '',
      contentType: contentType,
      chat: chatId,
      products: products,
    };

    var message = await messagesModel.create({ ...newMessage });

    message = await message.populate(
      "sender",
      "name email profileImage isOnline"
    );
    message = (await message.populate("chat")).populate("products");
    message = await userModel.populate(message, {
      path: "chat.users",
      select: "name email profileImage isOnline",
    });

    // await chatModel.findByIdAndUpdate(
    //   { _id: chatId },
    //   { latestMessage: message.toObject() },
    //   { new: true }
    // );

    // Increment unread count for all users except the sender
    const chat = await chatModel.findById(chatId);
    chat.users.forEach((userId) => {
      if (userId.toString() !== req.user._id.toString()) {
        chat.unreadMessageCount.set(
          userId.toString(),
          (chat.unreadMessageCount.get(userId.toString()) || 0) + 1
        );
      }
    });

    chat.latestMessage = message.toObject();
    await chat.save();

    // Create notifications for other users in the chat (dealers)
    try {
      const sender = await userModel.findById(req.user._id);
      const project = chat.projectId ? await projectModel.findById(chat.projectId) : null;
      
      for (const userId of chat.users) {
        if (userId.toString() !== req.user._id.toString()) {
          const recipient = await userModel.findById(userId);
          // Only create notification if recipient is a dealer (admin role)
          if (recipient && recipient.role === 'admin') {
            await notificationModel.create({
              user: userId,
              subject: `New message from ${sender.name}`,
              context: content ? 
                (content.length > 100 ? content.substring(0, 100) + '...' : content) : 
                contentType === 'image' ? 'Sent an image' : 'Sent a message',
              type: 'chat',
              redirectLink: project ? `/projects/${project._id}/chat` : `/messages`,
              status: 'unread',
            });
          }
        }
      }
    } catch (notifError) {
      console.error('Error creating chat notification:', notifError);
      // Don't fail the message send if notification creation fails
    }

    res.status(200).json({
      success: true,
      message: "Message post successfully!",
      message: message,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Error occur while send message!",
      error: error,
    });
  }
};

// Get All Messages
export const getChatMessages = async (req, res) => {
  try {
    const chatId = req.params.id;
    const userId = req.params.userId;
    const messages = await messagesModel
      .find({ chat: req.params.id })
      .populate("sender", "name email profileImage isOnline")
      .populate("chat")
      .populate("products");

    const chat = await chatModel.findById(chatId);
    if (chat) {
      chat.unreadMessageCount.set(userId.toString(), 0);
      await chat.save();
    }

    res.status(200).json({
      success: true,
      messages: messages,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Error while get messages!",
      error: error,
    });
  }
};
