const express = require("express");

const { notFound, BadRequest } = require("http-errors");

const { User } = require("../../models");
const { authenticate } = require("../../middlewares");
const { sendEmail } = require("../../helpers");

const { SITE_NAME } = process.env;

const path = require("path");
const fs = require("fs/promises");
const Jimp = require("jimp");

const { User } = require("../../models");
const { authenticate, upload } = require("../../middlewares");


const router = express.Router();

const avatarsDir = path.join(__dirname, "../../", "public", "avatars");

router.get("/logout", authenticate, async (req, res) => {
  const { _id } = req.user;
  await User.findByIdAndUpdate(_id, { token: null });
  res.status(204).send();
});

router.get("/current", authenticate, async (req, res) => {
  const { name, email } = req.user;
  res.json({
    user: {
      name,
      email,
    },
  });
});

router.post("/verify", async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      throw new BadRequest("missing required field email");
    }
    const user = await User.findOne({ email });
    if (!user) {
      throw new notFound("User not found");
    }
    if (user.verify) {
      throw new BadRequest("Verification has already been passed");
    }
    const { verificationToken } = user;
    const data = {
      to: email,
      subject: "Подтверждение email",
      html: `<p>Thank you for joining our service.</p>
            <hr/>
            <p>Click here to verify your email address</p>
            <a target="_blank" href="http://${SITE_NAME}/api/users/verify/${verificationToken}"></a>`,
    };
    await sendEmail(data);
    res.json({ message: "Verification email sent" });
  } catch (error) {
    next(error);
  }
});

router.get("/verify/:verificationToken", async (req, res, next) => {
  try {
    const { verificationToken } = req.params;
    const user = await User.findOne({ verificationToken });
    if (!user) {
      throw new notFound("User not found");
    }
    await User.findByIdAndUpdate(user._id, {
      verificationToken: null,
      verify: true,
    });
    res.json({
      message: "Verification successful",
    });
  } catch (error) {
    next(error);
  }
});

router.patch(
  "/avatars",
  authenticate,
  upload.single("avatar"),
  async (req, res) => {
    const { path: tempUpload, filename } = req.file;
    const [extension] = filename.split(".").reverse();
    const newFileName = `${req.user._id}.${extension}`;
    const fileUpload = path.join(avatarsDir, newFileName);
    await fs.rename(tempUpload, fileUpload);
    const avatarURL = path.join("avatars", newFileName);
    try {
      const avatarToResize = await Jimp.read(fileUpload);
      avatarToResize.resize(250, 250).write(fileUpload);
    } catch (error) {
      console.log(error);
      throw new Error("Error cropping avatar");
    }
    await User.findByIdAndUpdate(req.user._id, { avatarURL }, { new: true });
    res.json({ avatarURL });
  }
);


module.exports = router;
