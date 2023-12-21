import express from 'express';
import path from 'path';
import ejs from 'ejs';
import bodyParser from 'body-parser';
import { MongoClient, ServerApiVersion } from 'mongodb';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import nodemailer from 'nodemailer';

const uri = "mongodb+srv://Admin:nR18eHCkif6yvno0@cluster0.ak6hid0.mongodb.net/?retryWrites=true&w=majority";

const client = new MongoClient(uri);
const app = express();

app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(session({
  secret: "thisisasecretkey",
  saveUninitialized: true,  
  cookie: { maxAge: 86400000 },
  resave: false
}))
app.use((req, res, next) => {
  res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate'); //So that user cannot logout and then still be logged in using the back button in their browser.
  res.locals.isLoggedIn = req.session.username !== undefined;
  next();
});

app.set('view engine', 'ejs');

const __dirname = path.resolve();

app.get('/', (req, res) => {
  res.render('index');
});

app.get('/index', (req, res) => {
  res.render('index');
});

app.get('/booking', (req, res) => {
  res.render('booking');
});

app.get('/estimate', (req, res) => {
  res.render('estimate');
});

app.get('/contact', (req, res) => {
  res.render('contact');
});

app.get('/sign-up', (req, res) => {
  res.render('sign-up');
});

app.get('/login', (req, res) => {
  // Check if the user is already logged in
  if (req.session.username) {
    // Redirect to the home page if logged in
    res.redirect('/');
  } else {
    // Continue rendering the login page for users not logged in
    const passValid = req.session.passValid;
    const userValid = req.session.userValid;
    const emailValid = req.session.emailValid;
    console.log("Variables in session " + passValid, userValid, emailValid);
    res.render('login', { passValid, userValid, emailValid });
  }
});


app.get('/profile', (req, res) => {
    const userData = req.session.userData;
    console.log("Username in session:", req.session.username);
    if (req.session.username) {
      res.render('profile', { userData });
    }
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    } else {
      res.locals.isLoggedIn = false;
      res.redirect('/login');
    }
  });
});

app.post('/login-form', async (req, res) => {
  try {
    const user = req.body.username + "";
    const pass = req.body.password + "";

    console.log(user + " " + pass);

    await checkLogin(user, pass, req, res);   

  }
  catch (error) {
    console.error(error);
    res.send("Login failed, try again.");
    return;
  }
});

app.post('/save-form', async (req, res) => {
  try {
    const updates = req.body;
    const username = req.body.username;
    console.log(username);
    await updateDetails(updates, username, req);

    // Redirect to the profile page after successfully updating
    res.redirect('/profile');
  } catch (error) {
    console.error("Error processing save-form:", error);
    res.status(500).send("Internal Server Error");
  } finally {
    await client.close();
  }
});

async function sendEmail(userEmail, subject, text) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'shethmohnish@gmail.com',
      pass: 'dnec wwtn rysh gmna'
    }
  });
  
  const mailOptions = {
    from: 'shethmohnish@gmail.com',
    to: userEmail,
    subject: subject,
    text: text
  };
  
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending email:', error);
    } else {
      console.log('Email sent:', info.response);
    }
  });
}

app.post('/contact-form', (req, res) => {
  const subject = req.body.subject;
  const email = req.body.email;
  const message = req.body.message;

  sendEmail(email, subject, message);

  console.log("Sent e-mail sucessfully to: " + email);

  res.redirect('/contact');
  
});

async function updateDetails(formData, user, req) {
  try {
    console.log("Connecting to update server...");

    await client.connect();
    const database = client.db("user-details");
    const details = database.collection("details");

    const query = { username: user };

    console.log("FORM DATA", formData);

    const result = await details.updateOne(query, { $set: formData });

    if (result.matchedCount === 1 && result.modifiedCount === 0) {
      console.warn("Update did not modify any fields.");
    } else {
      console.log("Update completed successfully.");

      // Update session data after successfully updating the database
      req.session.userData = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phoneNum: formData.phoneNumber,
        adr: formData.address,
        pCode: formData.postalCode,
        userName: formData.username,
        passWord: formData.password,
      };
    }
  } catch (error) {
    console.error("Error updating details:", error);
    throw error; // Rethrow the error to handle it in the calling function
  } finally {
    await client.close();
  }
}

app.post('/submit-form', async (req, res) => {
  try {
    const formData = req.body;

    let usernameTaken = await checkValidUsername(req.body.username);

    if (usernameTaken === false) {
      console.log(formData);

      await saveDetails(formData);

      req.session.username = formData.username; 
      req.session.userData = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phoneNum: formData.phoneNumber,
        adr: formData.address,
        pCode: formData.postalCode,
        userName: formData.username,
        passWord: formData.password,
      };
  
      res.redirect('/profile');
    }
    else {
      res.send("Username Taken");
    }
  }
  catch (error) {
    console.error(error);
    res.send('Error submitting details, try again.');
  }
});

app.listen(3000, () => {
  console.log('Express server initialized');
});

//Check login information when logged in
async function checkLogin(user, pass, req, res) {
  console.log("Checking login info...");
  try {
    await client.connect();

    const database = client.db("user-details");
    const details = database.collection("details");

    let query;

    if (user.includes("@")) {
      const email = { email: user };
      query = await details.findOne(email);
      if (query === null) {
        console.log("email not found");
        req.session.emailValid = false;
        req.session.passValid = true;
        req.session.userValid = true;
        res.redirect("/login");
        return;
      }
    } else {
      const username = { username: user };
      query = await details.findOne(username);
      if (query === null) {
        console.log("user not found");
        req.session.userValid = false;
        req.session.passValid = true;
        req.session.emailValid = true;
        res.redirect("/login");
        return;
      }
    }

    const detailsDoc = await details.findOne(query);

    if (detailsDoc) {
      const password = detailsDoc.password;
      if (password == pass) {
        req.session.username = detailsDoc.username;
        req.session.userData = {
          firstName: detailsDoc.firstName,
          lastName: detailsDoc.lastName,
          email: detailsDoc.email,
          phoneNum: detailsDoc.phoneNumber,
          adr: detailsDoc.address,
          pCode: detailsDoc.postalCode,
          userName: detailsDoc.username,
          passWord: detailsDoc.password,
        };
        console.log("Correct password");
        res.redirect('/profile');
        return;
      } else {
        console.log("Incorrect password");
        req.session.passValid = false;
        req.session.emailValid = true;
        req.session.userValid = true;
        res.redirect("/login");
        return;
      }
    }
  } finally {
    await client.close();
  }
}

//Saving the user details to the database by connecting to it and inserting the form details.
async function saveDetails(formData) {
  try {
    console.log("Connecting to Database");

    await client.connect();
    const database = client.db("user-details");
    const details = database.collection("details");

    await details.insertOne(formData);

    console.log("User details sumbitted to Database");

  } finally {
    await client.close();
  }
}

//Checking for unique username so that there aren't duplicate users.
async function checkValidUsername(user) {
  console.log("Checking username...");

  await client.connect();
  const database = client.db("user-details");
  const details = database.collection("details");

  let query = await details.findOne({username: user});

  if (query) {
    //console.log("duplicate user found");
    return true;
  }
  else {
    //console.log("user valid!");
    return false;
  }
}