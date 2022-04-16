'use strict';
const uuid = require('uuid');
const AWS = require('aws-sdk'); 
const serverless = require('serverless-http');
const express = require('express')
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
var fs = require('fs'); 
const csv = require('csv-parse');
const nodemailer = require("nodemailer");
var async = require('async');
var _ = require('lodash');
var cors = require('cors');
const app = express()

const dynamoDb = new AWS.DynamoDB.DocumentClient();
const dynamodbDocClient = new AWS.DynamoDB({ region: "eu-west-1" });
app.use(cors());
app.use(bodyParser.json({ strict: false }));
app.use(fileUpload({
  createParentPath: true
}));

app.get('/', function (req, res) {
  res.send('Welcome to Send Grade REST API Service')
}) 

app.get('/send-feedback/:id', function (req, res) {
  
  const Class_id = req.params.id //params
  const params = {
    TableName: process.env.DB_TABLE,
    KeyConditionExpression: "ClassName = :ClassName",
    ExpressionAttributeValues: {
                ':ClassName': Class_id
            },
  }

  dynamoDb.query(params, (error, result) => {
    if (error) {
      console.log(error);
      res.status(400).json({ error: 'Feedback - Error' });
    }
    if (result.Items) {
      // https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/ses-examples-sending-email.html
      // var scanResults=[]
      // result.Items.forEach((item) => scanResults.push(item['Email']));
      console.log(`[INFO] : Feedback - Listing all the students in Class: `,result.Items.length)
      
      const AWS_SES_ACCESS_KEY_ID = process.env.AWS_SES_ACCESS_KEY_ID;
      const AWS_SES_SECRET_ACCESS_KEY = process.env.AWS_SES_SECRET_ACCESS_KEY;
      const AWS_SES_FROM = process.env.AWS_SES_FROM;

      
async function sendEmail(receivers) {
        // console.log("R",receivers)
        var mailOptions= {
          from: AWS_SES_FROM,
          to: receivers["Email"],
          text: `Dear ${receivers["Name"]} ${receivers["Surname"]}, you've received ${receivers["Grades"]} for Class ${receivers["ClassName"]} . Feedback : ${receivers["Feedback"]}`,
          // html: '<b> Hi'+ email +' </b>',
          subject: `Class ${receivers["ClassName"]} Your Grades`, // Subject line
        };
      var smtpTransporter = nodemailer.createTransport({
        port: 465,
        host: 'email-smtp.eu-west-1.amazonaws.com',
        secure: true,
        auth: {
          user: AWS_SES_ACCESS_KEY_ID,
          pass: AWS_SES_SECRET_ACCESS_KEY,
        },
        debug: true
      });
      

      await smtpTransporter.sendMail(mailOptions)
      // , function(error, response){
      //     if(error){
      //         return(error);
      //     }else{
      //         return(response);
               
      //         // smtpTransporter.close();
      //     }
        
      //   });
        
      }


      // Send e-mail using SMTP
      // smtpTransporter.sendMail(mailOptions, callback);
      async.forEachOf(result.Items, function iterator(user, index, callback) {
            sendEmail(user).then( 
              function(results){
                 console.log("results",results)
                 callback();
                
              }
              )
             

         }, function (err) {
          if (err) console.error(err.message);
          res.send("Feedback sent")
          
       });
       
       
        // for(var i=0; i<result.Items.length; i++){
        //     sendEmail(result.Items[i])
        // };
        
        // res.send("Feedback send")


    } else {
      res.status(404).json({ error: "Feedback for Classes not found" });
    }
  });

  
}) 



const timestamp = new Date().getTime();


// Get all Classes and Students
app.get('/list-all', function (req, res) {
  
  const params = {
    TableName: process.env.DB_TABLE,
  }

  dynamoDb.scan(params, (error, result) => {
    if (error) {
      console.log(error);
      res.status(400).json({ error: 'Could not get all Classes' });
    }
    if (result.Items) {

      res.send(result.Items);
      console.log(`[INFO] : Listing all the classes: `,result.Items)
    } else {
      res.status(404).json({ error: "Classes not found" });
    }
  });
})





// Read CSV
app.post('/upload-class-data', function (req, res) {
  console.log(`[INFO] : Reading CSV ...`,req)
  var class_name=req.query.class

// Columns "Class","Name","Surname","StudentID","Email","Grades","Feedback"

  try {
    csv.parse({ auto_parse: true,columns: true},req.body, function (err, data) {
           console.log('my_data', data);
 
// E
var item_data=[]
for (var i = data.length - 1; i >= 0; i--) {
          const this_item = {
            "PutRequest" : {
              "Item": {
                // our column names here, but we'll need do define the type
                "ClassName": {
                  "S": data[i].ClassName
                },
                "Name": {
                  "S": data[i].Name
                },
                "Surname": {
                  "S": data[i].Surname
                },
                "StudentID": {
                  "S": data[i].StudentID
                },
                "Email": {
                  "S": data[i].Email
                },
                "Grades": {
                  "S": data[i].Grades
                },
                "Feedback": {
                  "S": data[i].Feedback
                } 
                
                
              }
            }
          };
          item_data.push(this_item)
          // console.log("this_item",this_item)
        }
        
          let params = {
      RequestItems: {
           [ process.env.DB_TABLE ] : item_data
          }
      };
          dynamodbDocClient.batchWriteItem(params, (error) => {
            if (error) {
              console.log(error);
              res.status(400).json({ error: `[ERROR] : Class data could not be uploaded` });
            }else {
              console.log(`[INFO] : Class data uploaded successfully`)
              var s3 = new AWS.S3();
              console.log(`[INFO] : Backing up to S3`)
              var date=new Date().toISOString().slice(0,10);
              s3.putObject({
                Bucket: process.env.S3_BACKUP_BUCKET,
                Key: `${class_name}/class-${date}.csv`,
                Body: req.body
              }, function (err) {
                if (err) { throw err; }
              });
              res.send(data);
            }
            
            // res.json(params["Item"]);
          });
          //  End
        
         })
    } 
 catch (err) {
    console.log('err', err);
    res.status(500).send(err);
}
    });


module.exports.app = serverless(app);
