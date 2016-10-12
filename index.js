if (!process.env.SLACK_TOKEN) {
    console.log('Error: Specify token in environment');
    process.exit(1);
}

var Botkit = require('botkit');
var os = require('os');
var Moment = require('moment-timezone');
var BeepBoop = require('beepboop-botkit');

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
config: Infinity;

var controller = Botkit.slackbot(config);
var bot = controller.spawn({
    token: process.env.SLACK_TOKEN
}).startRTM();

//var beepboop = BeepBoop.start(controller, { debug: true });

controller.setupWebserver(process.env.PORT, function (err, webserver) {
    controller.createWebhookEndpoints(controller.webserver);
});


controller.hears(['help'], 'direct_message,direct_mention', function (bot, message) {
  bot.reply(message, "I am your Scrum Bot :robot_face:" +
    "\nI can start scrum on your command & update the channel with file of statuses from every member who co-operates." +
    "\nOnly authorized scrum masters in every channel can start scrum." +
    "\nCurrently only @ojas.gosar is authorized to start scrum (in order to avoid spam in public channels)." +
    "\n`coming soon - you can automate the process of scrum`");
});

controller.hears(['scrum', 'start scrum', 'scrum time', 'standup', 'stand up', 'stand-up'], 'direct_message,direct_mention,mention', function(bot, message) {
    
    if (message.user == 'U2K8XK03Z' || message.user == 'U23RT8WQ4') {
        //var users = [];
        bot.api.channels.info({
            channel: message.channel
        }, function(err, info) {
            if (err) {
                bot.botkit.log('Failed to get channel info :(', err);
                bot.reply(message,"I can't start scrum outside of a channel." +
                    "\nIf you havent already invited me to a channel then try `/invite @scrum_bot`" +
                    "\nThen `@scrum_bot scrum` to start scrum" +
                    "\nYou can also type `@scrum_bot help` to find out what i can do for you..");
            }
            else {
                var date = Moment().format("YYYYMMDD");
                bot.reply(message,"Starting Scrum now");
                for (var i = 0; i < info.channel.members.length; i++) {
                    console.log(info.channel.members[i]);
                    bot.api.users.info({
                        user: info.channel.members[i]
                    }, function(err, userInfo) {
                        if(userInfo.user.is_bot == false) {
                            console.log("user name:" + userInfo.user.name + " user id:" + userInfo.user.id + " is_bot:" + userInfo.user.is_bot);
                            //users.push(userInfo.user.id);
                            //console.log("users: " + users);
                            bot.startPrivateConversation({user: userInfo.user.id}, function(response, convo) {
                                areYouReadyForScrum(response, convo);
                                convo.on('end', function(dm) {
                                    if (dm.status == 'completed') {

                                        
                                        controller.storage.users.get(userInfo.user.id, function(err, user) {
                                            if (!user) {
                                                user = {
                                                    id: userInfo.user.id,
                                                    realName: userInfo.user.name,
                                                    channels: []
                                                }
                                            }

                                            scrum_status = "\nStatus for @" + user.realName + ":\n Yesterday: "+dm.extractResponse('yesterday') + "\n Today: " + dm.extractResponse('today') +"\n Issues: " + dm.extractResponse('issues');

                                            user.channels.push({
                                                id: message.channel,
                                                scrumStatus: [{
                                                    id: date,
                                                    text:scrum_status
                                                }]
                                            });

                                            console.log("User Object: ", user)
                                            controller.storage.users.save(user, function(err, id) {
                                                console.log("User:",id);
                                            });
                                        })
                                    }
                                    else {
                                        bot.startPrivateConversation(response.user, function(response, convo) { 
                                            convo.say('OK, this didnt go well, i will report to scrum master to personally look into you!');
                                        });
                                    }
                                });
                            });
                        }
                    });
                }

                setTimeout(function() {
                    controller.storage.users.all(function(err,userList) {

                        if (err) {
                            console.log("Error getting all users: ", err);
                        }
                        else {
                            console.log("Success all users: ", JSON.stringify(userList));
                            //var jsonUserList = JSON.stringify(userList);
                            var status = "";
                            
                            for (user in userList) {
                                console.log("userList[user].channels", userList[user].channels);
                                for (userChannel in userList[user].channels) {
                                    console.log("userList[user].channels[userChannel]:", userList[user].channels[userChannel]);
                                    console.log("message.channel", message.channel);
                                    if (userList[user].channels[userChannel].id == message.channel) {
                                        for (scrumStatus in userList[user].channels[userChannel].scrumStatus) {
                                            console.log("userList[user].channels[userChannel].scrumStatus:", userList[user].channels[userChannel].scrumStatus);
                                            console.log("date:", date);
                                            if (userList[user].channels[userChannel].scrumStatus[scrumStatus].id == date) {
                                                console.log("found Match:");
                                                status += userList[user].channels[userChannel].scrumStatus[scrumStatus].text;
                                            }
                                        }
                                    }

                                }
                            }

                            console.log("Final Status: ", status);
                            bot.api.files.upload({
                                content:((!status)? "No Status for Today" : status),
                                filename: date+"Scrum-Status",
                                channels: message.channel
                            }, function(err,result) {
                                if (err) {
                                    console.log("Error uploading file", err);
                                }
                                else {
                                    console.log("Result:",result);
                                }

                            });
                        }
                        
                    });
                }, CHANNEL_SCRUM_TIMEOUT);
            }

        }.bind(this));
    }
    else {
        bot.reply(message, 'Sorry <@' + message.user + '>, you are not authorized to spam :wink:');
    }
});

areYouReadyForScrum = function(response, convo) { 
    convo.ask('Its Scrum-time! Are you ready for standup?', [
        {
            pattern: bot.utterances.yes,
            callback: function(response, convo) {
                convo.say('Great, lets begin..');
                askYesterdayStatus(response, convo);
                convo.next();
            }
        },
        {
            pattern: bot.utterances.no,
            default: true,
            callback: function(response, convo) {
                convo.say('Alright, will ping you in sometime..');
                timeOutRepeat(response, convo);
                convo.next();
            }
        }
    ]);
};

askYesterdayStatus = function(response, convo) {
    console.log(convo);
    convo.ask("What did you do yesterday?", function(response, convo) {
        convo.say("Awesome.");
        askTodayStatus(response, convo);
        convo.next();
  }, {'key': 'yesterday'});
};

timeOutRepeat = function(response, convo) {
    setTimeout(function() {
        bot.startPrivateConversation(response, areYouReadyForScrum);
        convo.next();
    }, INDIVIDUAL_SCRUM_TIMEOUT);
};

askTodayStatus = function(response, convo) {
  convo.ask("What do you plan to do today?", function(response, convo) {
    convo.say("Ok. Sounds Great!")
    askIssues(response, convo)
    convo.next();
  }, {'key': 'today'});
};

askIssues = function(response, convo) { 
  convo.ask("Any impediments or blocking issues??", function(response, convo) {
    convo.say("Ok! Thank you :simple_smile:  ");
    convo.next();
  }, {'key': 'issues'});
};

// beepboop.on('add_resource', function (msg) {
//   console.log('received request to add bot to team')
// });

// // Send the user who added the bot to their team a welcome message the first time it's connected
// beepboop.on('botkit.rtm.started', function (bot, resource, meta) {
//   var slackUserId = resource.SlackUserID

//   if (meta.isNew && slackUserId) {
//     bot.api.im.open({ user: slackUserId }, function (err, response) {
//       if (err) {
//         return console.log("im.open error:",err)
//       }
//       var dmChannel = response.channel.id
//       bot.say({channel: dmChannel, text: 'Thanks for adding me to your team!'})
//       bot.say({channel: dmChannel, text: 'Just /invite me to a channel!'})
//     })
//   }
// });

controller.on('bot_channel_join', function (bot, message) {
    console.log("bot_channel_join")
  bot.reply(message, "I'm here!")
});

controller.hears(['hello', 'hi'], 'direct_message,direct_mention,mention', function(bot, message) {

    bot.api.reactions.add({
        timestamp: message.ts,
        channel: message.channel,
        name: 'robot_face',
    }, function(err, res) {
        if (err) {
            bot.botkit.log('Failed to add emoji reaction :(', err);
        }
    });


    controller.storage.users.get(message.user, function(err, user) {
        if (user && user.name) {
            bot.reply(message, 'Hello ' + user.name + '!!');
        } else {
            bot.reply(message, 'Hello.');
        }
    });
});

controller.hears(['call me (.*)', 'my name is (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var name = message.match[1];
    controller.storage.users.get(message.user, function(err, user) {
        if (!user) {
            user = {
                id: message.user,
            };
        }
        user.name = name;
        controller.storage.users.save(user, function(err, id) {
            bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
        });
    });
});

controller.hears(['what is my name', 'who am i'], 'direct_message,direct_mention,mention', function(bot, message) {

    controller.storage.users.get(message.user, function(err, user) {
        if (user && user.name) {
            bot.reply(message, 'Your name is ' + user.name);
        } else {
            bot.startConversation(message, function(err, convo) {
                if (!err) {
                    convo.say('I do not know your name yet!');
                    convo.ask('What should I call you?', function(response, convo) {
                        convo.ask('You want me to call you `' + response.text + '`?', [
                            {
                                pattern: 'yes',
                                callback: function(response, convo) {
                                    // since no further messages are queued after this,
                                    // the conversation will end naturally with status == 'completed'
                                    convo.next();
                                }
                            },
                            {
                                pattern: 'no',
                                callback: function(response, convo) {
                                    // stop the conversation. this will cause it to end with status == 'stopped'
                                    convo.stop();
                                }
                            },
                            {
                                default: true,
                                callback: function(response, convo) {
                                    convo.repeat();
                                    convo.next();
                                }
                            }
                        ]);

                        convo.next();

                    }, {'key': 'nickname'}); // store the results in a field called nickname

                    convo.on('end', function(convo) {
                        if (convo.status == 'completed') {
                            bot.reply(message, 'OK! I will update my dossier...');

                            controller.storage.users.get(message.user, function(err, user) {
                                if (!user) {
                                    user = {
                                        id: message.user,
                                    };
                                }
                                user.name = convo.extractResponse('nickname');
                                controller.storage.users.save(user, function(err, id) {
                                    bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
                                });
                            });



                        } else {
                            // this happens if the conversation ended prematurely for some reason
                            bot.reply(message, 'OK, nevermind!');
                        }
                    });
                }
            });
        }
    });
});

controller.hears(['identify yourself', 'who are you', 'what is your name'],
    'direct_message,direct_mention,mention', function(bot, message) {

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
