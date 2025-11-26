const express = require("express");
const crypto = require("crypto");
const cors = require("cors");
const app = express();
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());
var admin = require("firebase-admin");

var serviceAccount = require("./zap-shift-71cb9-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const verify = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).json({
      message: "Unauthorized access",
    });
  }
  if (token) {
  }
  next();
};

const generateTrackingId = () => {
  const randomString = crypto.randomBytes(6).toString("hex").toUpperCase();
  return `TRK-${randomString}`;
};
app.get("/", (req, res) => {
  res.status(200).json({
    status: 200,
    message: "Zap shift server is running",
  });
});

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { log } = require("console");
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
    const paymentCollection = database.collection("payment");

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

    // Payment Api
    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = Number(paymentInfo.value) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "USD",
              unit_amount: amount,
              product_data: {
                name: paymentInfo.parcelName,
              },
            },
            quantity: 1,
          },
        ],
        customer_email: paymentInfo.senderEmail,
        mode: "payment",
        metadata: {
          parcelId: paymentInfo.parcelId,
          parcelName: paymentInfo.parcelName,
        },
        success_url: `${process.env.DOMAIN_LINK}/dashboard/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.DOMAIN_LINK}/dashboard/payment/cancelled`,
      });

      res.send({ url: session.url });
    });

    app.patch("/session-status", async (req, res) => {
      const trackingId = generateTrackingId();
      const sessionId = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      const transactionId = session.payment_intent;
      const query = { transactionId: transactionId };
      const existingPayment = await paymentCollection.findOne(query);
      if (existingPayment) {
        return res.send({
          success: false,
          message: "Payment already processed",
          transactionId: transactionId,
          trackingId: existingPayment.trackingId,
        });
      }

      if (session.payment_status === "paid") {
        const id = session.metadata.parcelId;
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: { paymentStatus: "paid", trackingId: trackingId },
        };
        const result = await parcelCollection.updateOne(query, updateDoc);

        const paymentStatus = {
          amount: session.amount_total / 100,
          currency: session.currency,
          customerEmail: session.customer_email,
          parcelId: session.metadata.parcelId,
          parcelName: session.metadata.parcelName,
          transactionId: session.payment_intent,
          paymentStatus: session.payment_status,
          paidAt: new Date(),
          trackingId: trackingId,
        };
        if (session.payment_status === "paid") {
          const paymentResult = await paymentCollection.insertOne(
            paymentStatus
          );
          res.send({
            success: true,
            trackingId: trackingId,
            transactionId: session.payment_intent,
            modifyParcel: result,
            paymentInfo: paymentResult,
          });
        }
      }

      res.send({
        success: false,
      });
    });

    app.get("/payment-history", verify, async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.customerEmail = email;
      }
      const options = { sort: { paidAt: -1 } };
      const results = await paymentCollection.find(query, options).toArray();
      res.status(200).json({
        message: "Payment history",
        results,
      });
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
