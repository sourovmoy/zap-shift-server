const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
  res.status(200).json({
    status: 200,
    message: "Zap shift server is running",
  });
});

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = process.env.DATABASE_KEY;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const database = client.db("zap-shift");
    const userCollection = database.collection("user");
    const parcelCollection = database.collection("parcel");

    app.post("/parcel", async (req, res) => {
      try {
        const parcel = req.body;
        parcel.createdAt = new Date();

        const results = await parcelCollection.insertOne(parcel);
        res.status(201).json({
          message: "Data is stored to database",
          results,
        });
      } catch (error) {
        res.status(400).json({
          message: "Can't store data to database",
          error: error.message,
        });
      }
    });

    app.get("/parcel", async (req, res) => {
      try {
        const query = {};
        const email = req.query.email;

        if (email) {
          query.senderEmail = email;
        }
        const options = { sort: { createdAt: -1 } };
        const results = await parcelCollection.find(query, options).toArray();
        res.status(200).json({
          message: "All parcel",
          results,
        });
      } catch (error) {
        res.status(400).json({
          message: "Failed to get data",
          error: error.message,
        });
      }
    });
    app.delete("/parcel/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const results = await parcelCollection.deleteOne(query);
        res.status(200).json({
          message: "delete request sent",
          results,
        });
      } catch (error) {
        res.status(400).json({
          message: "Failed to delete data",
          error: error.message,
        });
      }
    });
    app.get("/parcel/:parcelId", async (req, res) => {
      try {
        const id = req.params.parcelId;
        const query = { _id: new ObjectId(id) };
        const results = await parcelCollection.findOne(query);
        res.status(200).json({
          message: "delete request sent",
          results,
        });
      } catch (error) {
        res.status(400).json({
          message: "Failed to delete data",
          error: error.message,
        });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// app.all(/.*/, (req, res) => {
//   res.status(500).json({
//     status: 404,
//     message: "Api not found",
//   });
// });

app.listen(port, () => {
  console.log(`Zap shift app listening on port ${port}`);
});
