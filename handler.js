'use strict';

const serverless = require('serverless-http');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const express = require('express');
const app = express();
const AWS = require('aws-sdk');
const axios = require('axios');

const USERS_TABLE = process.env.USERS_TABLE;
const IS_OFFLINE = process.env.IS_OFFLINE;

const jsonParser = bodyParser.json({ strict: false });
const formParser = bodyParser.urlencoded({ extended: false });
app.set('view engine', 'pug');
app.use(cookieParser());

let dynamoDb;

if (IS_OFFLINE === 'true') {
    dynamoDb = new AWS.DynamoDB.DocumentClient({
        region: 'localhost',
        endpoint: 'http://localhost:8000',
    })
    console.log(dynamoDb)
} else {
    dynamoDb = new AWS.DynamoDB.DocumentClient()
}

function addUser(name, pass) {
    const params = {
        TableName: USERS_TABLE,
        Item: {
            userId: name,
            pass,
            g: 0,
            f: 0,
            t: 0
        },
    };

    dynamoDb.put(params, (error) => {
        if (error) {
            console.log(error);
        }
        console.log(`Added User «${name}»`)
    });
}

addUser('shelly','bob')
addUser('bobby','elle')

function activeSession(req) {
    const auth = req.cookies.auth
    console.log('auth check', auth)
    return auth;
}

app.get('/', function(req, res) {
    //res.send('Test')
    const session = activeSession(req);

    if (!session) {
        res.render('index');
    }

    const params = {
        TableName: USERS_TABLE,
        Key: {
            userId: session,
        },
    };

    dynamoDb.get(params, (error, result) => {
        if (error) {
            console.log(error);
            res.render('index');
        }
        console.log(result)
        if (result.Item) {
            const {userId, g,f,t} = result.Item;
            res.render('index', {
                user: userId,
                g,
                f,
                t,
            });
        } else {
            res.send(500)
        }
    });
});

app.get('/login', function(req, res) {
    //res.send('Test')
    const session = activeSession(req);
    if (session) {
        res.redirect('/');
    } else {
        res.render('login');
    }
});

app.post('/login', formParser, function(req, res) {
    const { un, pass } = req.body;
    console.log(`««««««««««««««««${un}:${pass}»»»»»»»»»»»»`)
    if (typeof un !== 'string') {
        res.status(400).json({ error: `Invalid User ID`})
    } else if ( typeof pass !== 'string') {
        res.status(400).json({ error: `Invalid Password`})
    }

    const params = {
        TableName: USERS_TABLE,
        Key: {
            userId: un,
        },
    };

    dynamoDb.get(params, (error, result) => {
        if (error) {
            console.log(error);
            res.status(400).json({ error: 'User not found'});
        }
        if (result.Item
         && result.Item.pass
         && result.Item.pass === pass) {
            const {userId, pass} = result.Item;
            res.cookie('auth', userId, {maxAge: 90000, httpOnly: true})
            res.redirect('/')
        } else {
            res.send(403, 'Unauthorized: ')
        }
    });
});

app.get('/q/:website', function (req, res) {
    const session = activeSession(req);
    if (!session) {
        res.send(403);
    }
    const website = req.params.website;
    console.log('site query', website)
    if (website !== 'google'
     && website !== 'facebook'
     && website !== 'twitter') {
        res.send(400);
    }
    const counterPropName = website[0];
    const params = {
        TableName: USERS_TABLE,
        Key: {
            userId: session,
        },
        UpdateExpression: `SET ${counterPropName} = g + :x`,
        //ExpressionAttributeNames: {'#a':'g'},
        ExpressionAttributeValues: {':x':1},
        ReturnValue: 'UPDATED_NEW'
    };

    dynamoDb.update(params, function (error, result) {
        if (error) {
            console.log(error);
            res.status(500)
        }
        if (result) {
            console.log('updated', result);
            axios.get(`https://www.${website}.com`)
                .then(response => {
                    console.log('fetch response', response.headers)
                    res.render('result',{result: response.headers})
                })
                .catch(error => {
                    console.log('fetch error', error)
                    res.status(500)
                })
        }
    })
});

app.get('/users/:userId', function (req, res) {
    const params = {
        TableName: USERS_TABLE,
        Key: {
            userId: req.params.userId,
        },
    };

    dynamoDb.get(params, (error, result) => {
        if (error) {
            console.log(error);
            res.status(400).json({ error: 'User not available '});
        }
        if (result.Item) {
            const {userId, name} = result.Item;
            res.json({ userId, name });
        } else {
            res.status(404).json({ error: 'User not found'})
        }
    })
});

app.post('/users', function(req, res) {
    const { userId, name } = req.body;
    if (typeof userId !== 'string') {
        res.status(400).json({ error: `Invalid User ID`})
    } else if ( typeof name !== 'string') {
        res.status(400).json({ error: `Invalid User Name`})
    }

    const params = {
        TableName: USERS_TABLE,
        Item: {
            userId,
            name,
        },
    };

    dynamoDb.put(params, (error) => {
        if (error) {
            console.log(error);
            res.status(400).json({ error: 'Could not add user'});
        }
        res.json({ userId, name })
    });
});
module.exports.handler = serverless(app);
