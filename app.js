import express from "express";
import bodyParser from "body-parser";
import path from "path";
import session from "express-session";
import pkg from "pg";
import connectPgSimple from "connect-pg-simple";
import PasswordValidator from "password-validator";

global.__dirname = path.resolve();

const app = express();
const PORT = 3000;

const connection = `postgres://shoyo:YFztfHNtfS76zBkE8iAIq8GWSM7oZCgh@dpg-co7o3h21hbls73ed83hg-a.singapore-postgres.render.com/salon_iwlh?ssl=true`
const { Pool } = pkg;
const pgPool = new Pool({
  connectionString: connection
});

pgPool.on("connect", () => {
  console.log("Connected to the database.");
});

const schema = new PasswordValidator();
schema
.is().min(8)
.is().max(100)
.is().uppercase()
.has().lowercase()
.has().digits(1)
.has().not().spaces();

const pgSessionInstance = connectPgSimple(session);

app.use(session({
    store: new pgSessionInstance({
      pool: pgPool,
      tableName: "session",
    }),
    secret: "my salaon",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 60 * 60 * 1000,
      expires: 1000 * 60 * 24,
    },
  })
);


app.use(express.static(path.join(__dirname, '/src')));
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'index.html'));
});

app.get("/login", (req, res) => {
    let error = null;
    res.render('login', { error });
});

app.post("/login", async (req, res) => {
    try {
        let { email, password } = req.body;
        const client = await pgPool.connect();
        const result = await client.query('SELECT * FROM users WHERE email = $1 AND password = $2', [email, password]);
        client.release();

        if (result.rows.length > 0) {
            let storedEmail = result.rows[0].email;
            let storedPassword = result.rows[0].password;

            if (email !== storedEmail || password !== storedPassword) {
              res.render('login', { error: "Invalid Credentials" });  
            } else {
                req.session.isAuth = true;
                res.redirect(`/profile?email=${email}`);
            }
        } else {
            res.render('login', { error: "No Such User Exists." });
        }
    } catch (err) {
        res.status(500).send('<h1>Internal Server Error</h1>')
    }
});

app.get('/sign-up', (req, res) => {
  let error = null;
  res.render('sign-up', { error });
}); 

app.post('/sign-up', async (req, res) => {
  let { firstName, lastName, email, phone, password1, password2 } = req.body;
  if ( password1 !== password2) {
    return res.render('sign-up', { error: "Passwords Do Not Match." });
  }

  if (!schema.validate(password1)) {
    return res.render('sign-up', { error: "Password Does Not Meet The Requirements." });
  }

  try {
    const client = await pgPool.connect();
    const result = await client.query('INSERT INTO users (first_name, last_name, email, phone, password) VALUES ($1, $2, $3, $4, $5)', [firstName, lastName, email, phone, password1]);
      res.redirect('/login');
  } catch (err) {
    res.render('sign-up', { error: "Couldn't Sign Up." });
  }
});

app.get('/profile', async (req, res) => {
  if(!req.session.isAuth) {
    return res.redirect('/login');
  } else {
    try {
      let email = req.query.email;
      const client = await pgPool.connect();
      const result = await client.query('SELECT * FROM users WHERE email = $1', [email]);
      client.release();

      if (result.rows.length > 0) {
        let user = result.rows[0];
        res.render('profile', { user });
      } else {
        res.render('profile', { error: "The user doesn't exist." });
      }
    } catch (err) {
      res.status(500).send('<h1>Internal Server Error</h1>');
    }
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).send('<h1>Internal Server Error</h1>')
    }
    res.redirect('/login');
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
