// Importaciones de módulos
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config(); // Carga las variables de entorno desde .env

// Inicialización de la aplicación Express
const app = express();

// Middlewares
app.use(cors()); // Habilita CORS para todas las rutas
app.use(express.urlencoded({ extended: true })); // Para parsear datos de formularios (x-www-form-urlencoded)
app.use(express.json()); // Para parsear JSON

// Obtener la URI de MongoDB desde las variables de entorno
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("Error: MONGO_URI no está definida en el archivo .env");
  process.exit(1); // Salir si la URI no está configurada
}

// Conectar a MongoDB
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const db = mongoose.connection;
db.on('error', (error) => {
    console.error('Error de conexión a MongoDB:', error);
    // Considera salir de la aplicación si la conexión es crítica y falla al inicio
    // process.exit(1);
});
db.once('open', () => {
  console.log('Conectado exitosamente a MongoDB');
});

// Schemas de Mongoose
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true } // unique: true puede ser útil
});

const exerciseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Referencia al modelo User
  description: { type: String, required: true },
  duration: { type: Number, required: true },
  date: { type: Date, required: true }
});

// Modelos de Mongoose
const User = mongoose.model('User', userSchema);
const Exercise = mongoose.model('Exercise', exerciseSchema);

// Rutas
app.get('/', (req, res) => {
  // Servir un archivo HTML simple para la interfaz (opcional, pero bueno para FCC)
  res.sendFile(__dirname + '/views/index.html');
});

// POST /api/users => crear usuario
app.post('/api/users', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: 'El nombre de usuario es requerido' });
    }

    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.json({ username: existingUser.username, _id: existingUser._id }); // O un error si prefieres
    }

    const newUser = new User({ username });
    const savedUser = await newUser.save();
    res.json({ username: savedUser.username, _id: savedUser._id });
  } catch (err) {
    console.error("Error en POST /api/users:", err);
    if (err.code === 11000) { // Código de error de MongoDB para clave duplicada
        return res.status(400).json({ error: 'El nombre de usuario ya existe.' });
    }
    res.status(500).json({ error: 'Falló la creación del usuario' });
  }
});

// GET /api/users => lista de usuarios
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}, 'username _id'); // Selecciona solo username y _id
    res.json(users);
  } catch (err) {
    console.error("Error en GET /api/users:", err);
    res.status(500).json({ error: 'Error al obtener la lista de usuarios' });
  }
});

// POST /api/users/:_id/exercises => agregar ejercicio
app.post('/api/users/:_id/exercises', async (req, res) => {
  try {
    const userId = req.params._id;
    const { description, duration, date } = req.body;

    if (!description || !duration) {
        return res.status(400).json({ error: 'Descripción y duración son requeridas.' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado con ese ID' });
    }

    // Manejar la fecha: si se provee, usarla; si no, usar la fecha actual.
    // Asegurarse de que la fecha sea válida.
    let exerciseDate;
    if (date) {
      exerciseDate = new Date(date);
      if (isNaN(exerciseDate.getTime())) { // Verifica si la fecha es inválida
        return res.status(400).json({ error: 'Formato de fecha inválido' });
      }
    } else {
      exerciseDate = new Date();
    }

    const parsedDuration = parseInt(duration);
    if (isNaN(parsedDuration) || parsedDuration <= 0) {
        return res.status(400).json({ error: 'La duración debe ser un número positivo.' });
    }

    const newExercise = new Exercise({
      userId: user._id,
      description: description,
      duration: parsedDuration,
      date: exerciseDate
    });

    const savedExercise = await newExercise.save();

    // La respuesta debe coincidir con el formato esperado por freeCodeCamp
    res.json({
      _id: user._id,
      username: user.username,
      date: savedExercise.date.toDateString(), // Formato "Mon Jan 01 1990"
      duration: savedExercise.duration,
      description: savedExercise.description
    });

  } catch (err) {
    console.error("Error en POST /api/users/:_id/exercises:", err);
    if (err.name === 'CastError' && err.path === '_id') {
        return res.status(400).json({ error: 'ID de usuario inválido' });
    }
    res.status(500).json({ error: 'Error al guardar el ejercicio' });
  }
});

// GET /api/users/:_id/logs => obtener ejercicios (logs)
app.get('/api/users/:_id/logs', async (req, res) => {
  try {
    const userId = req.params._id;
    const { from, to, limit } = req.query;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado con ese ID' });
    }

    let dateFilter = {};
    if (from) {
      const fromDate = new Date(from);
      if (!isNaN(fromDate.getTime())) dateFilter.$gte = fromDate;
      else return res.status(400).json({ error: 'Formato de fecha "from" inválido (YYYY-MM-DD)' });
    }
    if (to) {
      const toDate = new Date(to);
      if (!isNaN(toDate.getTime())) dateFilter.$lte = toDate;
      else return res.status(400).json({ error: 'Formato de fecha "to" inválido (YYYY-MM-DD)' });
    }

    let query = Exercise.find({ userId: user._id });

    if (Object.keys(dateFilter).length > 0) {
      query = query.where('date').gte(dateFilter.$gte).lte(dateFilter.$lte);
    }

    // Aplicar el límite si es un número válido
    const parsedLimit = parseInt(limit);
    if (!isNaN(parsedLimit) && parsedLimit > 0) {
      query = query.limit(parsedLimit);
    }

    const exercises = await query.select('description duration date -_id').exec(); // Excluir el _id del ejercicio

    const log = exercises.map(e => ({
      description: e.description,
      duration: e.duration,
      date: e.date.toDateString() // Formato "Mon Jan 01 1990"
    }));

    res.json({
      _id: user._id,
      username: user.username,
      count: log.length, // El conteo debe ser de los ejercicios filtrados
      log: log
    });

  } catch (err) {
    console.error("Error en GET /api/users/:_id/logs:", err);
    if (err.name === 'CastError' && err.path === '_id') {
        return res.status(400).json({ error: 'ID de usuario inválido' });
    }
    res.status(500).json({ error: 'Error al obtener los logs del ejercicio' });
  }
});

// Puerto de escucha
const PORT = process.env.PORT || 3000;
const listener = app.listen(PORT, () => {
  console.log('Tu aplicación está escuchando en el puerto ' + listener.address().port);
});