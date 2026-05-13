require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// mongoDB
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@cluster0.bmuc12j.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const usersCollection = client
      .db("gardenNestDB")
      .collection("users");
    const tipsCollection = client.db("gardenNestDB").collection("shareTips");
    const commentsCollection = client.db("gardenNestDB").collection("comments");

    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.get("/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: id };
      const result = await usersCollection.findOne(query);
      res.send(result);
      console.log(result);
    });

    app.get("/activeUsers", async (req, res) => {
      const result = await usersCollection
        .find({ status: "Active" })
        .limit(6)
        .toArray();
      res.send(result);
    });

    app.get("/trendingTips", async (req, res) => {
      const result = await tipsCollection
        .aggregate([
          { $match: { status: "Public" } },
          {
            $addFields: {
              likesCount: { $size: { $ifNull: ["$likedBy", []] } },
            },
          },
          { $sort: { likesCount: -1 } },
          { $limit: 6 },
        ])
        .toArray();
      res.send(result);
    });

    app.post("/tips", async (req, res) => {
      const newUser = req.body;
      const result = await tipsCollection.insertOne(newUser);
      res.send(result);
    });

    app.get("/tips", async (req, res) => {
      const result = await tipsCollection.find().toArray();
      res.send(result);
    });

    app.get("/browseTips", async (req, res) => {
      const result = await tipsCollection.find({ status: "Public" }).toArray();
      res.send(result);
    });

    app.get("/browseTips/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await tipsCollection.findOne(query);
      res.send(result);
    });

    app.post("/myTips", async (req, res) => {
      const { email } = req.body;
      const result = await tipsCollection.find({ email: email }).toArray();
      res.send(result);
    });

    app.delete("/tips/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await tipsCollection.deleteOne(query);
      res.send(result);
    });

    app.put("/tips/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateTips = req.body;
      const updateDoc = {
        $set: updateTips,
      };
      const result = await tipsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.get("/tips/:level", async (req, res) => {
      const levelData = req.params.level;
      const result = await tipsCollection
        .find({ level: levelData, status: "Public" })
        .toArray();
      res.send(result);
    });

    app.get("/sortedTips", async (req, res) => {
      const sortOrder = req.headers["sort-order"];
      const query = { status: "Public" };

      let result;
      if (sortOrder === "likes") {
        result = await tipsCollection
          .aggregate([
            { $match: query },
            {
              $addFields: {
                likesCount: { $size: { $ifNull: ["$likedBy", []] } },
              },
            },
            { $sort: { likesCount: -1 } },
          ])
          .toArray();
      } else {
        const sortDirection = sortOrder === "old" ? 1 : -1;
        result = await tipsCollection
          .find(query)
          .sort({ _id: sortDirection })
          .toArray();
      }
      res.send(result);
    });

    app.get("/searchTips", async (req, res) => {
      const { search, category, level } = req.query;
      let query = { status: "Public" };

      if (search) {
        query.title = { $regex: search, $options: "i" };
      }
      if (category && category !== "all") {
        query.category = category;
      }
      if (level && level !== "all") {
        query.level = level;
      }

      const result = await tipsCollection.find(query).toArray();
      res.send(result);
    });

    app.patch("/tips/:id/like", async (req, res) => {
      const { email } = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $addToSet: { likedBy: email },
      };
      const result = await tipsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.post("/myMostLikedTip", async (req, res) => {
      const { email } = req.body;
      const result = await tipsCollection
        .aggregate([
          { $match: { email } },
          {
            $addFields: {
              likesCount: { $size: { $ifNull: ["$likedBy", []] } },
            },
          },
          { $sort: { likesCount: -1 } },
          { $limit: 1 },
        ])
        .toArray();
      if (result.length > 0) {
        res.send(result[0]);
      } else {
        res.send(null);
      }
    });

    app.put("/users", async (req, res) => {
      const user = req.body;
      const filter = { email: user.email };
      const options = { upsert: true };

      // Protect the admin role: find if first admin exists AND check current user role
      const adminExists = await usersCollection.findOne({ role: "admin" });
      const existingUser = await usersCollection.findOne({ email: user.email });

      // Determine the role to assign:
      // 1. If no admin exists yet → make this user admin
      // 2. If current user is already admin → keep them admin
      // 3. Otherwise → use the role sent from the frontend (gardener/visitor)
        let roleToAssign;
        if (!adminExists) {
          roleToAssign = "admin";
        } else if (existingUser?.role === "admin") {
          roleToAssign = "admin"; // never downgrade an admin
        } else {
        roleToAssign = user.role || "visitor";
      }

      const updateDoc = {
        $set: {
          name: user.name,
          email: user.email,
          photoURL: user.photoURL,
          lastLogin: new Date(),
          specialty: user.specialty,
          bio: user.bio,
          role: roleToAssign,
        },
        $setOnInsert: {
          status: "Active",
          createdAt: new Date(),
        },
      };
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options,
      );
      res.send(result);
    });

    app.get("/users/role/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });
      res.send({
        role: user?.role || "visitor",
        status: user?.status || "Active",
      });
    });

    app.patch("/users/upgrade", async (req, res) => {
      const { email } = req.body;
      const result = await usersCollection.updateOne(
        { email: email },
        { $set: { role: "gardener" } }
      );
      res.send(result);
    });

    // Comments Endpoints
    app.post("/comments", async (req, res) => {
      const comment = req.body;
      comment.createdAt = new Date();
      const result = await commentsCollection.insertOne(comment);
      res.send(result);
    });

    app.get("/comments/:tipId", async (req, res) => {
      const tipId = req.params.tipId;
      const result = await commentsCollection
        .find({ tipId: tipId })
        .sort({ createdAt: -1 })
        .toArray();
      res.send(result);
    });

    // Admin Endpoints
    app.get("/admin/stats", async (req, res) => {
      const totalUsers = await usersCollection.countDocuments();
      const totalTips = await tipsCollection.countDocuments();
      const publicTips = await tipsCollection.countDocuments({
        status: "Public",
      });

      const tips = await tipsCollection.find().toArray();
      const totalLikes = tips.reduce(
        (acc, tip) => acc + (tip.likedBy?.length || 0),
        0,
      );

      res.send({
        totalUsers,
        totalTips,
        publicTips,
        totalLikes,
      });
    });

    app.get("/admin/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.patch("/admin/users/:id/role", async (req, res) => {
      const id = req.params.id;
      const { role } = req.body;
      const filter = { _id: new ObjectId(id) };
      const result = await usersCollection.updateOne(filter, {
        $set: { role },
      });
      res.send(result);
    });

    app.patch("/admin/users/:id/status", async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const filter = { _id: new ObjectId(id) };
      const result = await usersCollection.updateOne(filter, {
        $set: { status },
      });
      res.send(result);
    });

    app.get("/admin/tips", async (req, res) => {
      const result = await tipsCollection.find().toArray();
      res.send(result);
    });

    app.delete("/admin/tips/:id", async (req, res) => {
      const id = req.params.id;
      const result = await tipsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("gardenNest server is running...");
});

app.listen(port, () => {
  console.log(`Port is running on ${port}`);
});
