//this package is for storing the vulnerable data
//like apikey client id, client secret, ...
//should be at the top before everything else
require("dotenv").config();
//set up the express framework
const express = require("express");
//native http resuest in node
const https = require("https");
//set up the body parser for post request values
const bodyParser = require("body-parser");
//set up ejs template
const ejs = require("ejs");
//set up mongoose db
const mongoose = require("mongoose");
//these are required for the authentication purposes
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
//require google oauth package
const GoogleStrategy = require("passport-google-oauth20").Strategy;
//mongoose find or create plugin
const findOrCreate = require("mongoose-findorcreate");

//use the express
const app = express();
//use the required packages at the top
app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

//use the session: based on the documentation
//https://www.npmjs.com/package/express-session
app.use(
  session({
    secret: "keyboard cat",
    resave: false,
    saveUninitialized: false,
  })
);

//use passport
app.use(passport.initialize());

//use passport to set up the session
app.use(passport.session());

// connect to the mongodb
mongoose.connect("mongodb+srv://admin_ea:CXDEf2LKZoGOq8Ri@cluster0-phga0.mongodb.net/foodelDB?retryWrites=true&w=majority", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
//fix the error in the bash
mongoose.set("useCreateIndex", true);

//set up a user schema for the information of the user
const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  googleId: String,
  bmi: Number,
  gender: String,
});
//to hash and salt the password and save in the db
userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

//initialize a real user based on the userSchema
const User = new mongoose.model("User", userSchema);

//passport local configuration
passport.use(User.createStrategy());
//because we're using sessions
// passport.serializeUser(User.serializeUser());
// for any kind of authentication, better to use this:(not just for local mongoose)
passport.serializeUser(function (user, done) {
  done(null, user.id);
});
// passport.deserializeUser(User.deserializeUser());
// for any kind of authentication, better to use this:(not just for local mongoose)
passport.deserializeUser(function (id, done) {
  User.findById(id, function (err, user) {
    done(err, user);
  });
});

//set up the google strategy
passport.use(
  new GoogleStrategy(
    {
      //pass in these values from .env file
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      callbackURL: "http://localhost:3000/auth/google/foodel",
      userProfileIRL: "https://www.googleapis.com/oauth2/v3/userinfo",
    },
    function (accessToken, refreshToken, profile, cb) {
      // console.log(profile);
      //we need to first require the findOrCreate package: because it's not for mongoose
      //creates a username which keeps the profile id but if exists, it finds it only(not to create one)
      User.findOrCreate(
        {
          username: profile.id,
        },
        function (err, user) {
          return cb(err, user);
        }
      );
    }
  )
);

//get request for the home page(first page)
app.get("/", function (req, res) {
  //renders the home.ejs page
  res.render("home");
});

//this is a get request for the google api:
// authenicates the user using the google strategy at the top
//and then identifies the user's profile
app.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile"],
  })
);
// google authenticates the user locally:
// after clicking on the google button, it needs to authenticate locally
//if the authentication fails, goes back to the login page
app.get(
  "/auth/google/foodel",
  passport.authenticate("google", {
    failureRedirect: "/login",
  }),
  function (req, res) {
    // Successful authentication, go to the dashboard
    res.redirect("/dashboard");
  }
);

//get request: Login page
app.get("/login", function (req, res) {
  res.render("login");
});

//get request: register page
app.get("/register", function (req, res) {
  res.render("register");
});

//get request for the dashboard:
//user sees the dashboard if they're logged in
app.get("/dashboard", function (req, res) {
  // if a user is logged in, the dashboard should be rendered without any other authentications
  //if not redirects to the login page
  if (req.isAuthenticated()) {
    res.render("dashboard");
  } else {
    res.redirect("/login");
  }
});

//if the user wants to calculate their BMI, they press the button
// to get the page below which has a form:
app.get("/bmiCalculator", function (req, res) {
  //first we should authenticate the user
  if (req.isAuthenticated()) {
    res.render("bmiCalculator");
  } else {
    res.redirect("/login");
  }
});

//a post request when user completes the form to calculate the bmi
// and show the weekly calendar
app.post("/bmiCalculator", function (req, res) {
  //a function to calculate the bmi with 2 decimal places
  function getBmi(weight, height) {
    //get two decimal place for the bmi
    let bmi = (weight / (height * height)).toFixed(2);
    return bmi;
  }
  const userWeight = req.body.weight;
  const userHeight = req.body.height;
  const userBmi = getBmi(userWeight, userHeight);

  // console.log(req.user);

  //find the user
  User.findById(req.body.id, function (err, foundUser) {
    if (err) {
      console.log(err);
    } else {
      //if the user is found, go and save the bmi for the user
      if (foundUser) {
        foundUser.bmi = userBmi;
        foundUser.save();
      }
    }
    res.redirect("/planner");
  });
}); //end of post bmiCalculator

//when the information is submitted,it goes to the planner page
//this page checks the bmi ranges and sends an httprequest to the api Server
//grabs the information and sends it back to the user
app.get("/planner", function (req, res) {
  //first we should authenticate the user
  if (req.isAuthenticated()) {
    // conditions for the post request: getting from the form
    let minCalories = "";
    let maxCalories = "";
    if (req.body.bmi < 18.5) {
      minCalories = 500;
      maxCalories = 700;
    } else if (req.body.bmi <= 24.9 && req.body.bmi >= 18.5) {
      minCalories = 450;
      maxCalories = 600;
    } else {
      minCalories = 400;
      maxCalories = 500;
    }
    const baseUrl = "https://api.spoonacular.com/recipes/search?";
    //parameters
    const apiKey = process.env.API_KEY;

    //get the full url based on the parameters
    let url = baseUrl + "&apiKey=" + apiKey + "&minCalories=" + minCalories + "&maxCalories=" + maxCalories + "&number=7";
    // console.log(url);
    // make a get request
    https.get(url, function (response) {
      let data = "";
      // console.log(response.statusMessage);
      //get the actual chunk of data
      response.on("data", function (chunk) {
        data += chunk;
        // console.log(data);
      });
      response.on("end", function () {
        //convert the data to a javascript object

        const titleMonday = JSON.parse(data).results[0].title;
        const minutesMonday = JSON.parse(data).results[0].readyInMinutes;
        const imageMonday = JSON.parse(data).results[0].image;
        const imageUrlMonday = "https://spoonacular.com/recipeImages/" + imageMonday;
        const sourceUrlMonday = JSON.parse(data).results[0].sourceUrl;

        const titleTuesday = JSON.parse(data).results[1].title;
        const minutesTuesday = JSON.parse(data).results[1].readyInMinutes;
        const imageTuesday = JSON.parse(data).results[1].image;
        const imageUrlTuesday = "https://spoonacular.com/recipeImages/" + imageTuesday;
        const sourceUrlTuesday = JSON.parse(data).results[1].sourceUrl;

        const titleWednesday = JSON.parse(data).results[2].title;
        const minutesWednesday = JSON.parse(data).results[2].readyInMinutes;
        const imageWednesday = JSON.parse(data).results[2].image;
        const imageUrlWednesday = "https://spoonacular.com/recipeImages/" + imageWednesday;
        const sourceUrlWednesday = JSON.parse(data).results[2].sourceUrl;

        const titleThursday = JSON.parse(data).results[3].title;
        const minutesThursday = JSON.parse(data).results[3].readyInMinutes;
        const imageThursday = JSON.parse(data).results[3].image;
        const imageUrlThursday = "https://spoonacular.com/recipeImages/" + imageThursday;
        const sourceUrlThursday = JSON.parse(data).results[3].sourceUrl;

        const titleFriday = JSON.parse(data).results[4].title;
        const minutesFriday = JSON.parse(data).results[4].readyInMinutes;
        const imageFriday = JSON.parse(data).results[4].image;
        const imageUrlFriday = "https://spoonacular.com/recipeImages/" + imageFriday;
        const sourceUrlFriday = JSON.parse(data).results[4].sourceUrl;

        const titleSaturday = JSON.parse(data).results[5].title;
        const minutesSaturday = JSON.parse(data).results[5].readyInMinutes;
        const imageSaturday = JSON.parse(data).results[5].image;
        const imageUrlSaturday = "https://spoonacular.com/recipeImages/" + imageSaturday;
        const sourceUrlSaturday = JSON.parse(data).results[5].sourceUrl;

        const titleSunday = JSON.parse(data).results[6].title;
        const minutesSunday = JSON.parse(data).results[6].readyInMinutes;
        const imageSunday = JSON.parse(data).results[6].image;
        const imageUrlSunday = "https://spoonacular.com/recipeImages/" + imageSunday;
        const sourceUrlSunday = JSON.parse(data).results[6].sourceUrl;

        res.render("planner", {
          titleMonday: titleMonday,
          minutesMonday: minutesMonday,
          imageUrlMonday: imageUrlMonday,
          monday: sourceUrlMonday,
          titleTuesday: titleTuesday,
          minutesTuesday: minutesTuesday,
          imageUrlTuesday: imageUrlTuesday,
          tuesday: sourceUrlTuesday,
          titleWednesday: titleWednesday,
          minutesWednesday: minutesWednesday,
          imageUrlWednesday: imageUrlWednesday,
          wednesday: sourceUrlWednesday,
          titleThursday: titleThursday,
          minutesThursday: minutesThursday,
          imageUrlThursday: imageUrlThursday,
          thursday: sourceUrlThursday,
          titleFriday: titleFriday,
          minutesFriday: minutesFriday,
          imageUrlFriday: imageUrlFriday,
          friday: sourceUrlFriday,
          titleSaturday: titleSaturday,
          minutesSaturday: minutesSaturday,
          imageUrlSaturday: imageUrlSaturday,
          saturday: sourceUrlSaturday,
          titleSunday: titleSunday,
          minutesSunday: minutesSunday,
          imageUrlSunday: imageUrlSunday,
          sunday: sourceUrlSunday,
        });
        // }
      });
    });
  } else {
    res.redirect("/login");
  }
});

//logout session
app.get("/logout", function (req, res) {
  req.logout();
  //go back to the home page
  res.redirect("/");
});

//a post request for the registration
app.post("/register", function (req, res) {
  User.register(
    {
      username: req.body.username,
    },
    req.body.password,
    function (err, user) {
      if (err) {
        console.log(err);
        res.redirect("/register");
      } else {
        passport.authenticate("local")(req, res, function () {
          //if there's no error show the dashboard
          res.redirect("/dashboard");
        });
      }
    }
  );
}); //end of register post

app.post("/login", function (req, res) {
  //create a new user from the mongoose model
  const user = new User({
    username: req.body.username,
    password: req.body.password,
  });
  //use passport to login the user and authenticate it
  req.login(user, function (err) {
    if (err) {
      console.log(err);
    } else {
      passport.authenticate("local")(req, res, function () {
        res.redirect("/dashboard");
      });
    }
  });
});
let port = process.env.PORT;
if (port == null || port == "") {
  port = 3000;
}
//server listens to port 3000 to get connected
app.listen(port, function () {
  console.log("Server Initialized");
});
