const dotenv = require('dotenv');
dotenv.config();
const express = require('express');
const app = express();
const mongoose = require('mongoose');
const cors = require('cors');
const logger = require('morgan');
const testJwtRouter = require('./controllers/test-jwt');
const authRouter = require('./controllers/auth');
const usersRouter = require('./controllers/users.js');
const soundBytesRouter = require("./controllers/soundBytes.js");
const tracksRouter = require('./controllers/tracks.js');
const verifyToken = require('./middleware/verify-token');

mongoose.connect(process.env.MONGODB_URI);

mongoose.connection.on('connected', () => {
  console.log(`Connected to MongoDB ${mongoose.connection.name}.`);
});

const PORT = process.env.PORT ? process.env.PORT: 3000;

app.use(cors());
app.use(express.json());
app.use(logger('dev'));
app.use('/auth', authRouter);
app.use('/test-jwt', testJwtRouter);
app.use('/users', usersRouter);
app.use("/sBytes", soundBytesRouter);
app.use('/tracks', tracksRouter);

// basic 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// basic error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

app.listen(PORT, () => {
  console.log('The express app is ready!');
});
