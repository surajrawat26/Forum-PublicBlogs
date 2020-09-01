require("dotenv").config();
const express = require ('express');
const ejs = require("ejs");
const bodyParser = require("body-parser");
const _ = require ('lodash');
const mongoose = require('mongoose');
const session = require("express-session");
const bcrypt = require('bcryptjs');
const salt = bcrypt.genSaltSync(10);
const passport = require ("passport");
const LocalStrategy = require("passport-local").Strategy;
const flash = require('connect-flash');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const findOrCreate = require("mongoose-findorcreate");
const nodemailer = require("nodemailer")
const mailgunTransport= require("nodemailer-mailgun-transport");
const { post } = require("jquery");
const multer = require("multer")
const path = require("path");
const { EIDRM } = require("constants");

const { Socket } = require("dgram");
const { stringify } = require("querystring");
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);




// Multer
var storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './public/uploads')
    },
    filename(req, file, cb) {
        cb(null, file.originalname)
    }
})



var upload = multer({
  
  storage: storage,
  fileFilter: function (req, file, callback) {
    var ext = path.extname(file.originalname);
    if (ext !== ".png" && ext !== ".jpg" && ext !== ".gif" && ext !== ".jpeg") {
        req.fileValidationError = "Only images are allowed";
      return callback(req.fileValidationError);
    }
    callback(null, true);
  },
  limits: {
    fileSize: 1024 * 10240, //10mb file limit
  },
});

// for connection
mongoose.connect('mongodb://localhost:27017/ClassRoomDB', { useNewUrlParser: true, useUnifiedTopology: true });
mongoose.set('useCreateIndex', true);
// mongoose.set('useCreateIndex',true);



app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
// app.use(express.static("public"));
app.use('/public', express.static(path.join(__dirname, "public")))

const photoPath = path.resolve(__dirname, 'public');
app.use(express.static(photoPath));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
   
}))








// intializing passport and express sessions with passport

app.use(passport.initialize());
app.use(passport.session());


app.use(flash());
//
app.use(function (req, res, next) {
  res.locals.errorMsg = req.flash("errorMsg");
  res.locals.SuccessMsg = req.flash("SuccessMsg");
  res.locals.error = req.flash('error');
  res.locals.SuccessPostMsg = req.flash("SuccessPostMsg")
  
  
  next();
});


// socket io for comments




// creating user schema which is going to be the structure of how the user's data gets stored in db
const UserSchema = new mongoose.Schema({

    name: {
        type: String
    },
   
    email:{
        type: String,
        
    },
    password: {
        type : String,
        
    },
    Rpassword: {
        type : String,
        
    },
    googleId: String,
    facebookId : String,
    twitterId: String,

    profile : {

    user: {
        type: mongoose.Schema.Types.ObjectId
    },

    Bio: {
        type: String,


    },
    gender: {
        type: String,

    },

    age: {
        type: Number,


    },


    Education: [
        {

            Qualification: {
                type: String,

            },

            FieldsofStudy: {
                type: String,

            },
            Experience: {
                type: String,

            }


        }
    ],


    SocialLinks: {

        instagram: {
            type: String,


        },

        facebook: {
            type: String,


        },

        twitter: {
            type: String,


        },

        linkedin: {
            type: String,


        },

        youtube: {
            type: String
        },

        others: {
            type: String
        }


    }
}

});


UserSchema.plugin(findOrCreate);


//post schema
const postSchema = new mongoose.Schema({
    
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
        
    },

    postType:[ 
        {
        type: String,
        required: true
        }
    ]
    ,
    title: {
        type: String,
        required: true
    
    },
    author:{
        type: String,
        
    },
    body: {
        type: String,
        required: true
    },

  
        
    comments: [ {
       
    text: String,
    }

    ]


        
    
    ,
    date:{
        type : Date
        
    },
    time : Number,
     
   photoPath: String
  
    
});




// these models are the constructors build using schemas defined above.for all the operation from creating an object to deleting we will do with the help of these models.
const User = new mongoose.model("User",UserSchema);
const Post = new mongoose.model("Post", postSchema);
// const Profile= new mongoose.model("Profile",ProfileSchema);



// passport local mongoose method to provide local strategy.

passport.use(new LocalStrategy({usernameField:"email"},
    (email, password, done)=> {
        User.findOne({ email: _.toLower(email) }, function (err, user) {
            if (err) { return done(err); }
            if (!user) {
                return done(null, false, { message: "Invalid email or password" });
            }
        
            // comparing password with the hashed one stored inside db.
            bcrypt.compare(password, user.password, (err,MatchFound) => {
                if (err){console.log(err);
                };
                if (MatchFound) {
                    return done(null, user);
                } else {
                    return done(null, false,{message: "Invalid email or password"});
                }
            });
        });
    })
)






// serialization and deserialization of user instance is required in order to work with passport


passport.serializeUser( (user, done)=> {
    done(null, user.id);
});

passport.deserializeUser( (id, done)=> {
    User.findById(id,(err, user)=> {
        done(err, user);
    });
});

// google strategy for signing in with google

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:8000/auth/google/classroom",
    },
    function (accessToken, refreshToken, profile, cb) {
      User.findOrCreate({ googleId: profile.id }, function (err, user) {
        return cb(err, user);
      });
    }
  )
);
// facebook strategy for signing in with facebook credentials
passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FB_CLIENT_ID,
      clientSecret: process.env.FB_CLIENT_SECRET,
      callbackURL: "http://localhost:8000/auth/facebook/classroom",
    },
    function (accessToken, refreshToken, profile, cb) {
      User.findOrCreate({ facebookId: profile.id }, function (err, user) {
        return cb(err, user);
      });
    }
  )
);




// google sign in routes
app.get("/auth/google",
  passport.authenticate("google", { scope: ["profile"] })
);


app.get("/auth/google/classroom",
  passport.authenticate("google", { failureRedirect: "/" }),
  function (req, res) {
    // parallel is the path for entering details for the user who used google or facebook authentication
    res.redirect("/parallel");
  }
);

// fb sign in routes

app.get("/auth/facebook", passport.authenticate("facebook"));

app.get( "/auth/facebook/classroom",
  passport.authenticate("facebook", { failureRedirect: "/" }),
  function (req, res) {

    res.redirect("/parallel");
  }
);


// Login route

app.get('/', (req,res)=>{

    res.render('login');
})



 

app.post("/login",passport.authenticate("local", {
    successRedirect: "/createProfile",
    failureRedirect: "/",
    failureFlash: true
   
    
    
  })
);







//--------------------------------- register route-------------------------------

app.get('/register',(req,res)=>{

res.render('register');

})

app.post("/register",(req,res)=>{
const hash = bcrypt.hashSync(req.body.Password, salt);
const newUser = new User({
    name : req.body.FirstName,
    email: _.toLower(req.body.Email),
    password: hash,
    Rpassword:hash
    
})

// Validations for  registeration


    const regularExpression = /^(?=.*[0-9])(?=.*[!@#$%^&*])[a-zA-Z0-9!@#$%^&*]{6,16}$/;

if(req.body.Password.length<6){

    req.flash("errorMsg","Password must contain atleast 6 characters");
    res.redirect("/register")
}
else if(regularExpression.test(req.body.Password)===false){

    req.flash("errorMsg", "Password must contain atleat one number,one special character and atleast one uppercase letter");
    res.redirect("/register")
}


else if(req.body.Password != req.body.Rpassword){

    req.flash("errorMsg", "Password doesn't match");
    res.redirect("/register");
}


else if (req.body.FirstName == "" || req.body.Email == '' || req.body.Password == '' || req.body.Rpassword == ''){
        req.flash("errorMsg","All fields are mandatory");
        res.redirect("/register");
    }

  


    else {

        if(req.body.Password===req.body.Rpassword){ 
            User.findOne({ email: req.body.Email }, (err, UsedRecord) => {
                if (err) {
                    console.log(err);

                }
                if (UsedRecord) {
                    req.flash("errorMsg","Email already exist");
                    res.redirect("/register")
                 }
                else {
                    newUser.save((err) => {
                        if (!err) {
                            req.flash("SuccessMsg", "Succesfully registered!");
                            res.redirect("/");
                        }
                        
                    })
                }
            })   
            
        }
     }

})





   
  





// we are going to open dash if and only if the  user details are authentic

app.get("/dash", function (req, res) {
if(req.isAuthenticated()){

  
    Post.find(function (err, posts) {

        
        if(err){
            console.log(err);
            res.redirect("/");
        }
    
        else{
            
            res.render("dash", { posts: posts });
          
           
        }
        
    }).sort({date : -1});

}
else{


    req.flash("errorMsg","You need to login first");
    res.redirect("/");
}

});



// Here we are showing the result specific to the tag clicked or searched tag



app.get("/tagPosts/:name",(req,res)=>{

    if(req.isAuthenticated){

        Post.find({postType: req.params.name},(err,record)=>{
            if(err){
                console.log(err);
                
            }
            res.render("tags", { Posts: record, Name: req.params.name})
        })
    }


})









// ----------------------------this is to reach compose route for composing the posts after logging in ----------------------------

app.get('/compose',(req,res)=>{

    if(req.isAuthenticated()){

        res.render("compose");
    }
    else{
        req.flash("errorMsg", "You need to login first");
        res.redirect("/");
    
    }
   
});




//compose post 

app.post("/compose",upload.single("Photo"),  (req, res)=> {
    
    var x = 'uploads/' + req.file.originalname; 

 User.findById({_id:req.user._id},(err,user)=>{

    if(err){
    console.log(err);
    
    }


else{

    const newPost = new Post({
        user: req.user._id,
        title: req.body.Ptitle,
        body: req.body.pBody,
        author: user.name,
        postType: req.body.Category,
        date: new Date(),
        time : new Date().getTime(),
        photoPath: x
        
    });
if(req.body.Category.includes("Choose")){
    req.flash("errorMsg","Choose Valid category");
    res.redirect("/compose");
}

else{
newPost.save((err) => {
        if (!err) {
            res.redirect("/dash");
           
        }
        if(err){
            console.log(err);
            req.flash("errorMsg",err)
            res.redirect("/compose");
        }
    });

}
    
    
}



 })   
    

});





// create profile


app.get("/createProfile", (req,res)=>{

    if(req.isAuthenticated()){
        if(req.user.profile.user === undefined){
            res.render('createProfile');
        }
        else{

            res.redirect("/dash")
        }
        
        
    }
    
});



app.post("/createProfile", (req,res)=>{
    
         User.updateOne({_id: req.user._id},{$set:{
           profile :{ 
            user: req.user._id,
            age: req.body.Age,
             Bio: req.body.Bio,
             gender: req.body.Gender,
             Education: [{

                 Qualification: req.body.Qualification,
                 FieldsofStudy: req.body.Field,
                 Experience: req.body.Experience
             }
             ],

             SocialLinks: {

                 instagram: req.body.Instagram,
                 facebook: req.body.Facebook,
                 linkedin: req.body.LinkedIn,
                 youtube: req.body.Youtube,
                 twitter: req.body.Twitter,
                 others: req.body.Other
             }
            }
            
         }},(err,updatedRecord)=>{
             if(err){
                 console.log(err);
                 
             }

             else if(req.body===undefined){

                res.redirect("/createProfile")
             }

            else if(updatedRecord){

                res.redirect("/dash");
             }
             
         })


            


       

    
})


// profile route

app.get("/profile",(req,res)=>{


    if(req.isAuthenticated()){

      Post.find({user: req.user._id},(err,recordFound)=>{
          if(err){
              console.log(err);
          }

          if(recordFound){
            
            
               
              res.render("ProfileView", {
                  myPosts : recordFound,
                  AccountHoldersName: _.upperFirst(req.user.name),
                  AccountHoldersEmail: _.upperFirst(req.user.email),
                  Age: req.user.profile.age,
                  Gender: req.user.profile.gender,
                  Bio: req.user.profile.Bio,
                  Qualification: req.user.profile.Education[0].Qualification,
                  Field: req.user.profile.Education[0].FieldsofStudy,
                  Experience: req.user.profile.Education[0].Experience,

                  facebook: req.user.profile.SocialLinks.facebook,
                  LinkedIn: req.user.profile.SocialLinks.linkedin,
                  Instagram: req.user.profile.SocialLinks.instagram,
                  Youtube: req.user.profile.SocialLinks.youtube,
                  Twitter: req.user.profile.SocialLinks.twitter,
                  googleId: req.user.googleId,
                  facebookId : req.user.facebookId






              })


          }
      }).sort({ date: "descending" });            
               
        
            
        }
        
    })



//for user's profile that you clicked on

app.get("/profile/:user",(req,res)=>{
     
    if(req.isAuthenticated){
        const userId = req.params.user;
      
        
        

        User.findById({_id: userId},(err,user)=>{
            if(err){
                console.log(err);
            }

            else  if(req.user._id==userId){
                res.redirect("/profile");
            }
            else{

                if (user) {
                    Post.find({ user: userId }, (err, posts) => {

                        if (err) {
                            console.log(err)
                        }
                        if (posts) {
                            res.render("usersProfile", {
                                Posts: posts,
                                AccountHoldersName: _.upperFirst(user.name),
                                AccountHoldersEmail: _.upperFirst(user.email),
                                Age: user.profile.age,
                                Gender: user.profile.gender,
                                Bio: user.profile.Bio,
                                Qualification: user.profile.Education[0].Qualification,
                                Field: user.profile.Education[0].FieldsofStudy,
                                Experience: user.profile.Education[0].Experience,

                                facebook: user.profile.SocialLinks.facebook,
                                LinkedIn: user.profile.SocialLinks.linkedin,
                                Instagram: user.profile.SocialLinks.instagram,
                                Youtube: user.profile.SocialLinks.youtube,
                                Twitter: user.profile.SocialLinks.twitter,
                            })
                        }
                    })
                }

            }
            
        })


    }
})



// Edit details route


app.get("/EditDetails",(req,res)=>{


    if(req.isAuthenticated()){

        res.render("editDetails");
    }
})

app.post("/EditDetails",(req,res)=>{


    User.updateOne({email:req.user.email},{$set:{

    name:req.body.EditName,
    
    }},(err, updatedRecord)=>{

    if(updatedRecord){
        req.flash("SuccessMsg","Sucessfully Changed the name")
        res.redirect("/profile");
    }
})

})


// Verification of password

app.post("/VerifyPassword",(req,res)=>{

    bcrypt.compare(req.body.currentPassword, req.user.password, (err, MatchFound) => {

        if(err){
            console.log(err);
           
            redirect("/VerifyPassword")
            
        }
        if(MatchFound){
            res.render("changePassword");
        }
        else{
            req.flash("errorMsg","Incorrect password");
            res.redirect("/VerifyPassword")
        }
    })
})





app.get("/VerifyPassword" ,(req,res)=>{

    if (req.isAuthenticated()) {

        res.render("VerifyPassword");
    }


})

// For changing password
app.post("/changePassword",(req,res)=>{
    
    const regularExpression = /^(?=.*[0-9])(?=.*[!@#$%^&*])[a-zA-Z0-9!@#$%^&*]{6,16}$/;
    const hash = bcrypt.hashSync(req.body.newPassword, salt);

    if(req.body.newPassword===req.body.RnewPassword){


            
            if(regularExpression.test(req.body.newPassword)===false){
                
                req.flash("errorMsg","Invalid password format, try again");
                res.redirect("/profile");

            }
            else if(req.body.newPassword.length<6){
                req.flash("errorMsg", "Password must contain atleast 6 characters");
                res.redirect("/profile");
            }
            else{
               

                    User.updateMany({ email: req.user.email }, {
                        $set: {
                            password: hash,
                            Rpassword: hash
                        }
                    }, (err, ChangedRecord) => { 
                        if(err){
                            console.log(err);
                            
                        }
                        if(ChangedRecord){

                            req.flash("SuccessMsg", "Password changed succesfully,Logout and try to login");
                            res.redirect("/profile")
                        }
                    })

                    
                
            }
        

    }

    else{
        req.flash("errorMsg", "Password does'nt match");
        res.redirect("/profile");
    }

})



// This parellel route is for the users who are logging in using google or facebook

app.get("/parallel",(req,res)=>{

    if(req.isAuthenticated()){

        if (req.user.profile.user === undefined) {
            res.render('parallel');
        }
        else {

            res.redirect("/dash")
        }
      
    }
})


app.post("/parallel",(req,res)=>{

   if(req.user.googleId != undefined){
       User.updateOne({googleId:req.user.googleId},{$set:{
           
           name: req.body.Name,
           email: req.body.Email,
           profile :{
           user: req.user._id,
           age: req.body.Age,
           Bio: req.body.Bio,
           gender: req.body.Gender,
           Education: [{

               Qualification: req.body.Qualification,
               FieldsofStudy: req.body.Field,
               Experience: req.body.Experience
           }
           ],

           SocialLinks: {

               instagram: req.body.Instagram,
               facebook: req.body.Facebook,
               linkedin: req.body.LinkedIn,
               youtube: req.body.Youtube,
               twitter: req.body.Twitter,
               others: req.body.Other
           }
        }
       }},(err,ChangedRecord)=>{
           if(err){
               console.log(err);
               
           }
           else if (req.body === undefined) {

               res.redirect("/parallel")
           }
          else if(ChangedRecord){
                res.redirect("/dash");

           }
       })
   }
 else if(req.user.facebookId != undefined){
       User.updateOne({ facebookId: req.user.facebookId }, {
           $set: {

               name: req.body.Name,
               email: req.body.Email,
               profile: {
                   user: req.user._id,
                   age: req.body.Age,
                   Bio: req.body.Bio,
                   gender: req.body.Gender,
                   Education: [{

                       Qualification: req.body.Qualification,
                       FieldsofStudy: req.body.Field,
                       Experience: req.body.Experience
                   }
                   ],

                   SocialLinks: {

                       instagram: req.body.Instagram,
                       facebook: req.body.Facebook,
                       linkedin: req.body.LinkedIn,
                       youtube: req.body.Youtube,
                       twitter: req.body.Twitter,
                       others: req.body.Other
                   }
               }
           }
       }, (err, ChangedRecord) => {
           if (err) {
               console.log(err);

           }
           else if (req.body === undefined) {

               res.redirect("/parallel")
           }
           else if (ChangedRecord) {
               res.redirect("/dash");

           }
       })
    }
    else{
        req.flash("errorMsg","Try again")
        res.redirect("/")
    }


})


//for creating page on the go



app.get("/Post/:subject",(req,res)=>{
    
    if(req.isAuthenticated()){
        const postId = req.params.subject;

        Post.findOne({_id:postId},(err,post)=>{
            if(err){
                console.log(err);
            }
            
            res.render("page",{Title:post.title ,
                 Body:post.body, 
                 Time: post.time, 
                 Photo : post.photoPath, 
                 Author: post.author, 
                 user: post.user,
                 postId :post._id,
                 comments: post.comments
                });
        })
    }


})

   








app.get("/profile/Post/:subject", (req, res) => {

    if (req.isAuthenticated()) {
        const postId = req.params.subject;

        Post.findOne({ _id: postId }, (err, post) => {
            if (err) {
                console.log(err);
            }
        
            res.render("page", { Title: post.title, Body: post.body, Time: post.time, Photo: post.photoPath, Author: post.author, user: post.user, comments: post.comments});
        })
    }


})
// for deletion of posts


app.get("/delete/:post",(req,res)=>{



    if(req.isAuthenticated){

       

        Post.deleteOne({_id: req.params.post},(err,isDeleted)=>{

            if(err){
                console.log(err);
                res.redirect('/profile')
            }

            if(isDeleted){

                req.flash("SuccessPostMsg", "Succesfully deleted the post")
                res.redirect('/profile')
            }
        })
    }
})


//for sending mails 
const auth = {

    auth: {
        api_key: process.env.MAIL_API_KEY,
        domain: process.env.MAIL_DOMAIN,
    },

}
//  mailgun transport for nodemailer
const transporter = nodemailer.createTransport(mailgunTransport(auth));


// contact page


app.post("/contact", (req,res)=>{


    const message = req.body.message;
    const sender = req.body.Sender



    // send mail with defined transport object
     transporter.sendMail(
       {
         from: '"Classroom" <testMail018021@gmail.com>',  
         to: "rawat.suraj00@gmail.com", // list of receivers
         subject: "This is the new contact request", // Subject line
         html: "<p>Sender: " + sender + "</p><p>Message:" + message + "</p>", // html body
       },
       (err, data) => {
         if (err) {
           console.log(err);
         }
         if (data) {
           console.log(data);
           req.flash("SuccessMsg", "Successfully sent the mail");
           res.redirect("/contact");
         }
       }
     );

    
   
})


app.get("/contact", (req,res)=>{


    res.render("contact");
})


//  forget password


app.get("/forgetPassword", (req,res)=>{

    res.render('forgetPassword')
})


app.post("/forgetPassword",(req,res)=>{

    User.findOne({email:req.body.Sender},(err,record)=>{
        if(err){
            console.log(err);
            req.flash("errorMsg", "Invalid Email, please try again")
            res.redirect('/forgetPassword')
            
        }
   
    if(record){

       



        const url = "http://localhost:8000/renewPassword/" + record._id;

        // send mail with defined transport object
        transporter.sendMail({
            from: '"Classroom" <testMail018021@gmail.com>', // sender address
            to: req.body.Sender, // list of receivers
            subject: "Request for password change", // Subject line
            text: "", // plain text body

            html: "<p>Click on the link below to change your password</p> <a href=" + url + ">Click here</a>", // html body
        }, (err, data) => {
            if (err) {
                console.log(err)
            }
            if (data) {
                console.log(data);
                req.flash("SuccessMsg", "Please check your mail to continue");
                res.redirect("/forgetPassword");
            }
        });



    }
    else{

        req.flash("errorMsg","Invalid email")
        res.redirect('/forgetPassword')
    }
   

    
   
    });

});

app.get("/renewPassword/:id",(req,res)=>{


    res.render("renewPassword");
})



 app.post("/renewPassword",(req,res)=>{

     const regularExpression = /^(?=.*[0-9])(?=.*[!@#$%^&*])[a-zA-Z0-9!@#$%^&*]{6,16}$/;
     const hash = bcrypt.hashSync(req.body.Password, salt);
     if (req.body.Password === req.body.RPassword) {
     if (regularExpression.test(req.body.Password) === false) {

         req.flash("errorMsg", "Invalid password format, try again");
         res.redirect("/renewPassword");

     }
     else if (req.body.Password.length < 6) {
         req.flash("errorMsg", "Password must contain atleast 6 characters");
         res.redirect("/renewPassword");
     }
     else {


         User.updateMany({ email: req.body.email }, {
             $set: {
                 password: hash,
                 Rpassword: hash
             }
         }, (err, ChangedRecord) => {
             if (err) {
                 console.log(err);
                 req.flash("errorMsg", "invalid Email");
                 res.redirect("/renewPassword");


             }
             if (ChangedRecord) {

                 req.flash("SuccessMsg", "Now you can login with your new password");
                 res.redirect("/")
             }
         })



     }
    }



    // search implementation
    
    
    


 })


// logout

app.get('/logout', function (req, res) {
    req.logout();
    req.flash("SuccessMsg", "Logged out successfully")
    res.redirect('/');
});

   
io.on("connection",(socket)=>{

    console.log("user is there")
})


app.listen(8000,()=>{
    console.log("Server started at port 8000");

});


 