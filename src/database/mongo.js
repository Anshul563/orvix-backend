import mongoose from "mongoose";

export const connectMongo = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("🟢 MongoDB Connected");
  } catch (error) {
    console.error("🔴 MongoDB Connection Error:", error.message);
    if (error.name === "MongooseServerSelectionError") {
      console.log("👉 Tip: Make sure your current IP address is whitelisted in your MongoDB Atlas Dashboard: https://cloud.mongodb.com/");
    }
  }
};