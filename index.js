/* Uses the slack button feature to offer a real time bot to multiple teams */
var Botkit = require('botkit');
var Https = require('https');
var Moment = require('moment-timezone');
var BeepBoop = require('beepboop-botkit');
var os = require('os');


var config = {}
if (process.env.MONGOLAB_URI) {
    var BotkitStorage = require('botkit-storage-mongo');
    config = {
        storage: BotkitStorage({mongoUri: process.env.MONGOLAB_URI}),
    };
} else {
    config = {
        json_file_store: './db_slackbutton_slash_command/',
    };
}

config.debug = true;
config.logLevel = 7;
retry: Infinity;

var controller = Botkit.slackbot(config);

var beepboop = BeepBoop.start(controller, { debug: true });

controller.setupWebserver(process.env.PORT, function (err, webserver) {
    controller.createWebhookEndpoints(controller.webserver);
});


var help = "I can help you forget the pain around Cats :slightly_smiling_face:" +
                "\nTry typing `/cats saveCredentials <username> <password>` to save credentials & test login" +
                "\nTry typing `/cats addTime <date in format YYYYMMDD> <order> <sub-order> <hours> <comment>` to book time" + 
                "\nTry typing `@cats_bot reminder` to remind everyone in the team to book time";

controller.on('slash_command', function (slashCommand, message) {

    switch (message.command) {
        case "/cats": 
            
            // but first, let's make sure the token matches!
            if (message.token !== process.env.VERIFICATION_TOKEN) return; //just ignore it.

            var text = message.text.trim().split(" ");
            switch (text[0]) {
                case "help":
                    slashCommand.replyPrivate(message, help);
                    break;

                case "saveCredentials":
                    if (!text[1] || !text[2]) {
                        slashCommand.replyPrivate(message, "I'm afraid you cant save credentials without passing 'em");
                        break;
                    }
                    var incomingUserName = text[1];
                    var incomingPassword = text[2];
                    var loginSuccess = true;
                    slashCommand.replyPrivate(message, "Attempting to login", function() {
                        loginSuccess = performLogin(slashCommand, message, incomingUserName, incomingPassword);
                    });

                    break;

                case "addTime":
                    var addTimeSuccess = true;
                    slashCommand.replyPrivate(message, "Attempting to add your hours to cats..", function() {
                        controller.storage.users.get(message.user, function(err, user) {
                            if (user && user.userName && user.password) {
                                var returnStatusCode = performLogin(slashCommand, message, user.userName, user.password);
                                if (true) {
                                    var comment = "";
                                    for (var i = 5; i < text.length; i++) {
                                        comment += text[i] + " ";
                                    }
                                    console.log("Comment:", comment);
                                    var date = ((text[1] === 'today') ? Moment().format("YYYYMMDD") : text[1]);
                                    if (!date || !(Moment(date, "YYYYMMDD", true).isValid()) || !text[2] || !text[3] || !text[4] || !comment) {
                                        slashCommand.replyPrivateDelayed(message, "Please pass data in the form of <date in format YYYYMMDD> <order> <sub-order> <hours> <comment> ");
                                        addTimeSuccess = false;
                                        return;
                                    }
                                    else {
                                        var incomingDate = date;
                                        var incomingOrder = text[2];
                                        var incomingSuborder = text[2] + "-" + text[3];
                                        var incomingHours = text[4];
                                        var formattedComment = comment.substring(0,50);
                                        var postTimeSuccess = true;
                                        slashCommand.replyPrivateDelayed(message, "Attempting to add your time", function() {
                                            controller.storage.users.get(message.user, function(err, user) {
                                                postTimeSuccess = performPostTime(slashCommand, message, incomingDate, incomingOrder, incomingSuborder, incomingHours, formattedComment, user.sid, user.defaultActivity);
                                            });
                                        });
                                    }
                                }
                                else {
                                    slashCommand.replyPrivateDelayed(message, "I do not have your right credentials to login, Try typing `/cats login <username> <password>` to login");
                                }
                            }
                            else {
                                slashCommand.replyPrivateDelayed(message, "I do not have your credentials to login, Try typing `/cats login <username> <password>` to login");
                            }

                        });
                    });
                    

                    break;

                default:
                    slashCommand.replyPublic(message, "I'm afraid I don't know how to " + message.command + " " + message.text + " yet.");
            }   

            break;
        default:
            slashCommand.replyPublic(message, "I'm afraid I don't know how to " + message.command + " " + message.text + " yet.");

    }

});

beepboop.on('add_resource', function (msg) {
  console.log('received request to add bot to team')
});

// Send the user who added the bot to their team a welcome message the first time it's connected
beepboop.on('botkit.rtm.started', function (bot, resource, meta) {
  var slackUserId = resource.SlackUserID

  if (meta.isNew && slackUserId) {
    bot.api.im.open({ user: slackUserId }, function (err, response) {
      if (err) {
        return console.log("im.open error:",err)
      }
      var dmChannel = response.channel.id
      bot.say({channel: dmChannel, text: 'Thanks for adding me to your team!'})
      bot.say({channel: dmChannel, text: 'Just /invite me to a channel!'})
    })
  }
});

controller.on('bot_channel_join', function (bot, message) {
    console.log("bot_channel_join")
  bot.reply(message, "I'm here!")
});

controller.hears(['hello', 'hi'], 'direct_mention', function (bot, message) {
  bot.reply(message, 'Hello.');
});

controller.hears(['hello', 'hi'], 'direct_message', function (bot, message) {
  bot.reply(message, 'Hello.')
  bot.reply(message, 'It\'s nice to talk to you directly.')
});

controller.hears('.*', 'mention', function (bot, message) {
  bot.reply(message, 'You really do care about me. :heart:')
});

controller.hears(['help'], 'direct_message,direct_mention', function (bot, message) {
  bot.reply(message, help)
});

controller.hears(['reminder'], 'direct_message,direct_mention', function (bot, message) {
    if (message.user == 'U2K8XK03Z' || message.user == 'U23RT8WQ4') {
        bot.reply(message, "On it..");

        bot.api.users.list({

        }, function(err, list) {
            if (err) {
                console.log('Failed to get users list :(', err);
            }
            else {
                console.log('users list :', list);
                for (var i = 0; i < list.members.length; i++) {

                    if(list.members[i].is_bot == false) {
                        bot.startPrivateConversation({user: list.members[i].id}, function(err,convo) {
                            convo.say("Its Cats Time :heart_eyes_cat: !!");
                            convo.say("Try typing `@cats_bot help` to find out how I can help Catsing.");
                        });
                    }
                }
            }

        });
    }
    else {
        bot.reply(message, 'Sorry <@' + message.user + '>, you are not authorized to spam :wink:');
    }

});

controller.hears(['identify yourself', 'who are you', 'what is your name'], 'direct_message,direct_mention,mention', function(bot, message) {

    var hostname = os.hostname();
    var uptime = formatUptime(process.uptime());

    bot.reply(message,
        ':robot_face: I am a bot named <@' + bot.identity.name +
        '>. I have been running for ' + uptime + ' on ' + hostname + '.' +
        '\n I have been created by Mr. Ojas Gosar');

});

function formatUptime(uptime) {
    var unit = 'second';
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'minute';
    }
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'hour';
    }
    if (uptime != 1) {
        unit = unit + 's';
    }

    uptime = uptime + ' ' + unit;
    return uptime;
}

function getCurrentTimestamp() {
    var current = Moment().format("YYYYMMDD HH:mm:ss");
    var timezoneid = Moment.tz.guess();
    return current + " " + timezoneid;
}

function performPostTime(slashCommand, message, incomingDate, incomingOrder, incomingSuborder, incomingHours, formattedComment, incomingSid, incomingDefaultActivity) {
    var options = {
        host: 'cats.arvato-systems.de',
        path: '/gui4cats-webapi/api/times',
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json; charset=utf-8',
            'Timestamp': getCurrentTimestamp(),
            'Consumer-Id': 'CATSmobile-client',
            'Consumer-Key': 'C736938F-02FC-4804-ACFE-00E20E21D198',
            'Version': '1.0',
            'Connection': 'keep-alive',
            'User-Agent': 'Mozilla/5.0',
            'x-fallback-origin': 'https://mobilecats.arvato-systems.de',
            'Cache-Control': 'no-cache',
            'Accept-Language': 'en',
            'sid': incomingSid
            }
    };

    console.log("Start Add time POST Request");

    var req = Https.request(options, function(res) {
        res.on('data',function(data){
            var jsonData = JSON.parse(data);
            console.log("JsonData:", jsonData);
            httpstatus = jsonData.httpstatus;
            switch (httpstatus) {
                case 201:
                    slashCommand.replyPrivateDelayed(message, "Cats entry was successful..");
                    break;

                case 400:
                    slashCommand.replyPrivateDelayed(message, jsonData.details);
                    break;

                default:
                    console.log("HttpsStatus:", httpstatus);

            }
        });
    });
    req.on('error', (e) => {
        console.error("Error:", e);
        slashCommand.replyPrivateDelayed(message, "something went wrong :(");
        return false;;
    });

    req.write('{"date":"'+incomingDate+'","workingHours":"'+incomingHours+'","comment":"'+formattedComment+'","orderid":"'+incomingOrder+'","suborderid":"'+incomingSuborder+'","activityid":"'+incomingDefaultActivity+'"}');
    req.end();

}

function performLogin(slashCommand, message, incomingUserName, incomingPassword) {
    var httpstatus = null;
    var sid = null;
    var firstName = null;
    var lastName = null;
    var defaultActivity = null;
    var options = {
        host: 'cats.arvato-systems.de',
        path: '/gui4cats-webapi/api/users',
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json; charset=utf-8',
            'User': incomingUserName,
            'Password': incomingPassword,
            'Timestamp': getCurrentTimestamp(),
            'Consumer-Id': 'CATSmobile-client',
            'Consumer-Key': 'C736938F-02FC-4804-ACFE-00E20E21D198',
            'Version': '1.0',
            'Connection': 'keep-alive',
            'User-Agent': 'Mozilla/5.0',
            'x-fallback-origin': 'https://mobilecats.arvato-systems.de',
            'Cache-Control': 'no-cache',
            'Accept-Language': 'en'
        }
    };

    console.log("Start Login get Request");
    var req = Https.request(options, function(res) {
        res.on('data',function(data){
            var jsonData = JSON.parse(data);
            console.log("JsonData:", jsonData);
            httpstatus = jsonData.httpstatus;
            switch (httpstatus) {
                case 200 :
                    sid = jsonData.meta.sid;
                    lastName = jsonData.name;
                    firstName = jsonData.prename;
                    defaultActivity = jsonData.defaultActivity;
                    if (!defaultActivity) {
                        slashCommand.replyPrivateDelayed(message, "You do not have defaultActivity set, please contact Cats Admin.");
                    };
                    controller.storage.users.get(message.user, function(err, user) {

                        if (!user) {
                            user = {
                                id: message.user
                            }
                        }

                        user.userName = incomingUserName;
                        user.password = incomingPassword;
                        user.firstName = firstName;
                        user.lastName = lastName;
                        user.sid = sid;
                        user.defaultActivity = defaultActivity;

                        controller.storage.users.save(user);

                    });

                    slashCommand.replyPrivateDelayed(message, firstName + " " + lastName + " you have successfully logged-in");
                    break;

                case 401 :
                    slashCommand.replyPrivateDelayed(message, jsonData.message);
                    break;

                default:
                    console.log("HttpsStatus:", httpstatus);
                    slashCommand.replyPrivateDelayed(message, "could not login for some reason = " + jsonData.message);

            }
            return httpstatus;
        });
    });
    req.on('error', (e) => {
        console.error("Error:", e);
        slashCommand.replyPrivateDelayed(message, "something went wrong :(");
    });
    req.end();
}
