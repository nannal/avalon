var http_port = process.env.HTTP_PORT || 3001
var express = require('express')
var cors = require('cors')
var bodyParser = require('body-parser')
var decay = require('decay')
var hotScore = decay.redditHot()
var fetchVideoInfo = require('youtube-info')
const {extract} = require('oembed-parser')
const ogs = require('open-graph-scraper')
const series = require('run-series')
const transaction = require('./transaction.js')

var http = {
    rankings: {
        hot: []
    },
    generateHot: function(cb) {
        db.collection('contents').find({pa: null}, {sort: {ts: -1}}).toArray(function(err, contents) {
            for (let i = 0; i < contents.length; i++) {
                contents[i].score = 0
                contents[i].ups = 0
                contents[i].downs = 0
                if (!contents[i].votes) 
                    continue
                
                for (let y = 0; y < contents[i].votes.length; y++) {
                    if (contents[i].votes[y].vt > 0)
                        contents[i].ups += Math.abs(contents[i].votes[y].vt)
                    if (contents[i].votes[y].vt < 0)
                        contents[i].downs += Math.abs(contents[i].votes[y].vt)
                    if (!contents[i].dist) contents[i].dist = 0
                }
                contents[i].score = hotScore(contents[i].ups, contents[i].downs, new Date(contents[i].ts))
            }
            contents = contents.sort(function(a,b) {
                return b.score - a.score
            })
            http.rankings.hot = contents
            cb()
        })
    },
    newRankingContent: function(content) {
        var alreadyAdded = false
        for (let i = 0; i < http.rankings.hot.length; i++) 
            if (content.author === http.rankings.hot[i].author && content.link === http.rankings.hot[i].link) {
                alreadyAdded = true
                http.rankings.hot[i].json = content.json
                break
            }
        

        if (!alreadyAdded) {
            content._id = content.author+'/'+content.link
            content.score = 0
            content.ups = 0
            content.downs = 0
            content.dist = 0
            if (content.votes[0].vt > 0)
                content.ups += Math.abs(content.votes[0].vt)
            if (content.votes[0].vt < 0)
                content.downs += Math.abs(content.votes[0].vt)
            http.rankings.hot.push(content)
        }
    },
    updateRankings: function(author, link, vote, dist) {
        newRankings = []
        for (let i = 0; i < http.rankings.hot.length; i++) {
            var ts = http.rankings.hot[i].ts
            if (http.rankings.hot[i].author === author && http.rankings.hot[i].link === link) {
                if (vote.vt > 0)
                    http.rankings.hot[i].ups += Math.abs(vote.vt)
                if (vote.vt < 0)
                    http.rankings.hot[i].downs += Math.abs(vote.vt)
                if (dist)
                    http.rankings.hot[i].dist += dist
                if (!http.rankings.hot[i].votes)
                    http.rankings.hot[i].votes = [vote]
                else
                    http.rankings.hot[i].votes.push(vote)
                    
                http.rankings.hot[i].score = hotScore(http.rankings.hot[i].ups, http.rankings.hot[i].downs, new Date(ts))
            }
            if (ts > new Date().getTime() - 7*24*60*60*1000)
                newRankings.push(http.rankings.hot[i])
        }
        http.rankings.hot = newRankings.sort(function(a,b) {
            return b.score - a.score
        })
    },
    init: () => {
        var app = express()
        app.use(cors())
        app.use(bodyParser.json())

        // fetch a single block
        app.get('/block/:number', (req, res) => {
            var blockNumber = parseInt(req.params.number)
            db.collection('blocks').findOne({_id: blockNumber}, function(err, block) {
                if (err) throw err
                res.send(block)
            })
        })
        
        // count how many blocks are in the node
        app.get('/count', (req, res) => {
            db.collection('blocks').countDocuments(function(err, count) {
                if (err) throw err
                res.send({
                    count: count
                })
            })
        })

        // check econ data
        app.get('/rewardPool', (req, res) => {
            eco.rewardPool(function(rp) {
                res.send(rp)
            })
        })

        // generate a new key pair
        app.get('/newKeyPair', (req, res) => {
            res.send(chain.getNewKeyPair())
        })

        // this suggests the node to produce a block and submit it
        app.get('/mineBlock', (req, res) => {
            delete p2p.recovering
            res.send(chain.getLatestBlock()._id.toString())
            chain.mineBlock(function(error, finalBlock) {
                if (error)
                    logr.error('ERROR refused block', finalBlock)
            })
        })

        // add data to the upcoming transactions pool
        app.post('/transact', (req, res) => {
            var tx = req.body
            if (!tx) {
                res.sendStatus(500)
                return
            }
            transaction.isValid(tx, new Date().getTime(), function(isValid, errorMessage) {
                if (!isValid) {
                    logr.trace('invalid http tx: ', errorMessage, tx)
                    res.status(500).send({error: errorMessage})
                } else {
                    p2p.broadcast({t:5, d:tx})
                    transaction.addToPool([tx])
                    res.send(chain.getLatestBlock()._id.toString())
                }
            })
        })

        // list connected peers
        app.get('/peers', (req, res) => {
            var peers = []
            for (let i = 0; i < p2p.sockets.length; i++) {
                var peer = {
                    ip: p2p.sockets[i]._socket.remoteAddress,
                    port: p2p.sockets[i]._socket.remotePort,
                }
                if (p2p.sockets[i].node_status)
                    peer.node_status = p2p.sockets[i].node_status

                peers.push(peer)
            }
            res.send(peers)
        })
        
        // connect to a new peer
        app.post('/addPeer', (req, res) => {
            p2p.connect([req.body.peer])
            res.send()
        })

        // look at the miner schedule
        app.get('/schedule', (req, res) => {
            res.send(chain.schedule)
        })
        
        // get full list of ranked miners
        app.get('/allminers', (req,res) => {
            db.collection('accounts').find({node_appr: {$gt: 0}}, {
                sort: {node_appr: -1}
            }).toArray(function(err, accounts) {
                if (err) throw err
                res.send(accounts)
            })
        })

        // get possible next blocks
        app.get('/nextblock', (req,res) => {
            res.send(p2p.possibleNextBlocks)
        })

        // get in-memory data (intensive)
        app.get('/cache', (req,res) => {
            res.send(cache)
        })
        app.get('/cacheb', (req,res) => {
            res.send(chain.recentBlocks)
        })

        // get hot
        app.get('/hot', (req, res) => {
            if (!http.rankings.hot || http.rankings.hot.length < 1) 
                http.generateHot(function() {
                    res.send(http.rankings.hot.slice(0,50))
                })
            else 
                res.send(http.rankings.hot.slice(0,50))
            
        })
        app.get('/hot/:author/:link', (req, res) => {
            var filteredContents = []
            var isPastRelativeContent = false
            var added = 0
            for (let i = 0; i < http.rankings.hot.length; i++) {
                if (isPastRelativeContent) {
                    filteredContents.push(http.rankings.hot[i])
                    added++
                }
                if (added >= 50) break
                if (http.rankings.hot[i].author === req.params.author
                && http.rankings.hot[i].link === req.params.link)
                    isPastRelativeContent = true
            }
            res.send(filteredContents)
        })

        // get new contents
        app.get('/new', (req, res) => {
            db.collection('contents').find({pa: null}, {sort: {ts: -1}, limit: 50}).toArray(function(err, contents) {
                res.send(contents)
            })
        })
        app.get('/new/:author/:link', (req, res) => {
            db.collection('contents').findOne({
                $and: [
                    {author: req.params.author}, 
                    {link: req.params.link}
                ]}, function(err, content) {
                db.collection('contents').find({
                    $and: [
                        {pa: null},
                        {ts: {$lte: content.ts}}
                    ]}, {sort: {ts: -1}, limit: 50}).toArray(function(err, contents) {
                    res.send(contents)
                })
            })
        })

        // get feed contents
        app.get('/feed/:username', (req, res) => {
            db.collection('accounts').findOne({name: req.params.username}, function(err, account) {
                if (!account || !account.follows) 
                    res.send([])
                else 
                    db.collection('contents').find({
                        $and: [
                            {author: {$in: account.follows}},
                            {pa: null}
                        ]}, {sort: {ts: -1}, limit: 50}).toArray(function(err, contents) {
                        res.send(contents)
                    })
                
            })
        })
        app.get('/feed/:username/:author/:link', (req, res) => {
            db.collection('contents').findOne({
                $and: [
                    {author: req.params.author}, 
                    {link: req.params.link}
                ]}, function(err, content) {
                db.collection('accounts').findOne({name: req.params.username}, function(err, account) {
                    if (!account.follows) 
                        res.send([])
                    else 
                        db.collection('contents').find({
                            $and: [
                                {author: {$in: account.follows}},
                                {pa: null},
                                {ts: {$lte: content.ts}}
                            ]}, {sort: {ts: -1}, limit: 50}).toArray(function(err, contents) {
                            res.send(contents)
                        })
                    
                })
            })
        })

        // get blog of user
        app.get('/blog/:username', (req, res) => {
            var username = req.params.username
            db.collection('contents').find({pa: null, author: username}, {sort: {ts: -1}, limit: 50}).toArray(function(err, contents) {
                res.send(contents)
            })
        })
        app.get('/blog/:username/:author/:link', (req, res) => {
            db.collection('contents').findOne({
                $and: [
                    {author: req.params.author}, 
                    {link: req.params.link}
                ]}, function(err, content) {
                if (err || !content)  {
                    res.send([])
                    return
                }
                var username = req.params.username
                db.collection('contents').find({
                    $and: [
                        {pa: null},
                        {author: username},
                        {ts: {$lte: content.ts}}
                    ]}, {sort: {ts: -1}, limit: 50}).toArray(function(err, contents) {
                    res.send(contents)
                })
            })
        })

        // account history api
        app.get('/history/:author/:lastBlock', (req, res) => {
            var lastBlock = parseInt(req.params.lastBlock)
            var author = req.params.author
            var query = {
                $and: [
                    { $or: [
                        {'txs.sender': author},
                        {'txs.data.target': author},
                        {'txs.data.receiver': author},
                        {'txs.data.pa': author},
                        {'txs.data.author': author}
                    ]}
                ]
            }
            if (lastBlock > 0) 
                query['$and'].push({_id: {$lt: lastBlock}})
            
            db.collection('blocks').find(query, {sort: {_id: -1}, limit: 50}).toArray(function(err, blocks) {
                res.send(blocks)
            })
        })

        // get new contents
        app.get('/content/:author/:link', (req, res) => {
            if (!req.params.author || typeof req.params.link !== 'string') {
                res.sendStatus(500)
                return
            }
            db.collection('contents').findOne({
                author: req.params.author,
                link: req.params.link
            }, function(err, post) {
                if (!post) {
                    res.sendStatus(404)
                    return
                }
                if (!post.child || post.child.length === 0) {
                    res.send(post)
                    return
                }
                post.comments = {}
                function fillComments(posts, cb) {
                    if (!posts || posts.length === 0) {
                        cb()
                        return
                    }
                    var executions = []
                    for (let i = 0; i < posts.length; i++) 
                        executions.push(function(callback) {
                            db.collection('contents').find({
                                pa: posts[i].author,
                                pp: posts[i].link
                            }).toArray(function(err, comments) {
                                for (let y = 0; y < comments.length; y++)
                                    post.comments[comments[y].author+'/'+comments[y].link] = comments[y]
                                fillComments(comments, function() {
                                    callback(null, true)
                                })
                            })
                            i++
                        })
                    
                    series(executions, function(err, results) {
                        if (err) throw err
                        cb(null, results)
                    })
                }
                fillComments([post], function() {
                    res.send(post)
                })
            })
        })

        // get current chain config
        app.get('/config', (req, res) => {
            res.send(config)
        })

        // get username price
        app.get('/accountPrice/:name', (req, res) => {
            if (!req.params.name) {
                res.sendStatus(500)
                return
            }
            db.collection('accounts').findOne({name: req.params.name}, function(err, account) {
                if (account) res.send('Not Available')
                else res.send(String(eco.accountPrice(req.params.name)))
            })
        })

        // get account info
        app.get('/account/:name', (req, res) => {
            if (!req.params.name) {
                res.sendStatus(500)
                return
            }
            db.collection('accounts').findOne({name: req.params.name}, function(err, account) {
                if (!account) res.sendStatus(404)
                else res.send(account)
            })
        })

        // get accounts info
        app.get('/accounts/:names', (req, res) => {
            if (!req.params.names || typeof req.params.names !== 'string') {
                res.sendStatus(500)
                return
            }
            var names = req.params.names.split(',', 100)
            db.collection('accounts').find({name: {$in: names}}).toArray(function(err, accounts) {
                if (!accounts) res.sendStatus(404)
                else {
                    for (let i = 0; i < accounts.length; i++) {
                        accounts[i].followsCount = (accounts[i].follows ? accounts[i].follows.length : 0)
                        accounts[i].followersCount = (accounts[i].followers ? accounts[i].followers.length : 0)
                        delete accounts[i].follows
                        delete accounts[i].followers
                    }
                    res.send(accounts)
                }
            })
        })

        // get follows
        app.get('/follows/:name', (req, res) => {
            if (!req.params.name) {
                res.sendStatus(500)
                return
            }
            db.collection('accounts').findOne({name: req.params.name}, function(err, account) {
                if (!account) res.sendStatus(404)
                else 
                if (account.follows)
                    res.send(account.follows)
                else
                    res.send([])
                
            })
        })

        // get followers
        app.get('/followers/:name', (req, res) => {
            if (!req.params.name) {
                res.sendStatus(500)
                return
            }
            db.collection('accounts').findOne({name: req.params.name}, function(err, account) {
                if (!account) res.sendStatus(404)
                else 
                if (account.followers)
                    res.send(account.followers)
                else
                    res.send([])
                
            })
        })

        // get notifications for a user
        app.get('/notifications/:name', (req, res) => {
            if (!req.params.name) {
                res.sendStatus(500)
                return
            }
            db.collection('notifications').find({u: req.params.name}, {sort: {ts: -1}, limit: 200}).toArray(function(err, notifs) {
                if (!notifs) res.sendStatus(404)
                else res.send(notifs)
            })
        })

        // test api (should be separated)
        // get youtube info
        app.get('/youtube/:videoId', (req, res) => {
            if (!req.params.videoId) {
                res.sendStatus(500)
                return
            }
            fetchVideoInfo(req.params.videoId, function(err, videoInfo) {
                res.send(videoInfo)
            })
        })

        // get oembed for any url
        app.get('/oembed/:url', (req, res) => {
            if (!req.params.url) {
                res.sendStatus(500)
                return
            }
            extract(req.params.url).then((data) => {
                res.send(data)
            }).catch(() => {
                res.sendStatus(404)
            })
        })

        // get open graph data for any url
        app.get('/opengraph/:url', (req, res) => {
            if (!req.params.url) {
                res.sendStatus(500)
                return
            }
            ogs({url: req.params.url}, function (error, results) {
                if (error) res.sendStatus(404)
                else res.send(results)
            })
        })

        app.listen(http_port, () => logr.info('Listening http on port: ' + http_port))
    }
}

module.exports = http
