// import { Router } from 'express';
// import { connectToDatabase } from './db/db';
// import { ObjectId } from 'mongodb';

// const router = Router();

// router.get('/items', async (req, res) => {
//     const db = await connectToDatabase();
//     const items = await db.collection('mycollection').find().toArray();
//     res.json(items);
// });

// router.get('/items/:id', async (req, res) => {
//     const db = await connectToDatabase();
//     const item = await db.collection('mycollection').findOne({ _id: new ObjectId(req.params.id) });
//     if (item) {
//         res.json(item);
//     } else {
//         res.status(404).send("Item not found");
//     }
// });

// router.post('/items', async (req, res) => {
//     const db = await connectToDatabase();
//     const result = await db.collection('mycollection').insertOne(req.body);
//     res.json({ _id: result.insertedId, ...req.body });
// });

// router.put('/items/:id', async (req, res) => {
//     const db = await connectToDatabase();
//     const result = await db.collection('mycollection').updateOne(
//         { _id: new ObjectId(req.params.id) },
//         { $set: req.body }
//     );
//     if (result.matchedCount > 0) {
//         res.send("Item updated");
//     } else {
//         res.status(404).send("Item not found");
//     }
// });

// router.delete('/items/:id', async (req, res) => {
//     const db = await connectToDatabase();
//     const result = await db.collection('mycollection').deleteOne({ _id: new ObjectId(req.params.id) });
//     if (result.deletedCount > 0) {
//         res.send("Item deleted");
//     } else {
//         res.status(404).send("Item not found");
//     }
// });

// export default router;
