# AVALON

## Get a node running

#### Dependencies
* [MongoDB](https://mongodb.com)
* [NodeJS](https://nodejs.org/en/download/) **v10** (LTS)
* [ntpd](https://linux.die.net/man/8/ntpd) or any NTP alternative for your system. ntpd comes pre-installed on most linux distributions

#### Install
* `npm install` to install nodejs dependencies
* Get your own keys with `node src/cli.js keypair`
* Save your keys
* Add your keys to `scripts/start.sh`
* `chmod +x scripts/start.sh`
* `./scripts/start.sh`

## Get helped
We have a discord channel dedicated to node owners (aka leaders), where you can get support to get set up. Join [discorg.gg/dtube](https://discord.gg/dtube) and go to `DTube Chain -> #leader-candidates`

## Using the CLI
You can use the CLI tool to transact with avalon. Simply try `node src/cli --help` or `node src/cli <command> --help` for a full help.

## Using Javalon
There is also a [Javascript module](https://www.npmjs.com/package/javalon) available and working on both browser and nodejs.

## HTTP GET API (incomplete)

#### Get block
```
curl http://localhost:3001/block/<block_num>
```

#### Get a new random key pair
```
curl http://localhost:3001/newKeyPair
```

#### Get new contents
```
curl http://localhost:3001/new
```

#### Get an account
```
curl http://localhost:3001/account/<name>
```

#### Get connected peers
```
curl http://localhost:3001/peers
```

#### Get miner schedule
```
curl http://localhost:3001/schedule
```

#### Get full list of miners sorted by rank
```
curl http://localhost:3001/allminers
```

#### Get block count
```
curl http://localhost:3001/count
```

#### Full list of API endpoints
And the recommended security practises if you want to open the API to the world
[https://docs.google.com/spreadsheets/d/1ORoHjrdq5V5OkTChijTUOEYRzTujVXTzCyNYt-ysVhw/edit?usp=drive_web&ouid=109732502499946497195](https://docs.google.com/spreadsheets/d/1ORoHjrdq5V5OkTChijTUOEYRzTujVXTzCyNYt-ysVhw/edit?usp=drive_web&ouid=109732502499946497195)

## Transacting
Once you have an account and balance, your account will start generating bandwidth and voting power which you can consume by transacting.

Necessary for all transactions:
* *key*: your private key
* * Use -K MyKeyHere to use a plain-text key
* * Use -F file.json to use a key inside a file to sign
* *user*: your username

#### Vote for a leader
* *target*: the node owner to approve
```
node src/cli.js vote-leader -K <key> -M <user> <target>
```

#### Unvote a leader
* *target*: the node owner to approve
```
node src/cli.js unvote-leader -K <key> -M <user> <target>
```

#### Transfer tokens
* *receiver*: username of the receiver of the transfer
* *amount*: number of tokens to transfer to the receiver
* *memo*: arbitrary short text content
```
node src/cli.js transfer -K <key> -M <user> <receiver> <amount> <memo>
```

#### Add a post / Commenting
* *link*: a short string to be used as the index of the content
* *parent_author*: the username of the author of the parent post
* *parent_link*: the link of the parent post
* *json*: arbitrary json input. example: `{"string":"aye", array:[1,2,3]}`
* *tag*: arbitrary short text content
* *weight* : the number of vote tokens to spend on this vote
```
node src/cli.js comment -K <key> -M <user> <link> <parent_author> <parent_link> <json>
```

#### Vote a post
* *link*: the link of the post to vote on
* *author*: the username of the author to vote on
* *weight*: the number of vote tokens to spend on this vote
* *tag*: arbitrary short text content
```
node src/cli.js vote -K <key> -M <user> <link> <author> <weight> <tag>
```

#### Edit your user json object
* *json*: arbitrary json input. example: `{"string":"aye", array:[1,2,3]}`
```
node src/cli.js profile -K <key> -M <user> <json>
```

#### Follow a user
* *target*: the user to follow
```
node src/cli.js follow -K <key> -M <user> <target>
```

#### Unfollow a user
* *target*: the user to unfollow
```
node src/cli.js unfollow -K <key> -M <user> <target>
```

#### Signing a raw transaction

To create a transaction and export it to a file, you can use the `sign` CLI tool
```
node src/cli.js sign <priv_key> <user> <tx> > tmptx.json
```
For example to approve a node owner and publishing it only 5 seconds later:
```
node src/cli.js sign -K 4L1C3553KRETK3Y -M alice '{"type":1,"data":{"target":"miner1"}}' > tmptx.json
sleep 5
curl -H "Content-type:application/json" --data @tmptx.json http://localhost:3001/transact
```

## POST Calls

#### Mine Block
Will force the node to try to produce a block even if it's unscheduled. Useful for block #1 and working on development
```
curl  http://localhost:3001/mineBlock
``` 

#### Add peer
Manually force connection to a peer without having to restart the node
```
curl -H "Content-type:application/json" --data '{"peer" : "ws://localhost:6001"}' http://localhost:3001/addPeer
```

## MongoDB Storage
Avalon saves the state of the chain into mongodb after each block. You can easily query mongodb directly to get any data you want, that wouldn't be provided by the API itself.
```
mongo <db_name>
db.accounts.findOne({name:'master'})
db.blocks.findOne({_id: 0})
```

## Elastic Search Storage
Avalon can also copy the accounts and contents into an elastic search database with [monstache](https://github.com/rwynn/monstache). A configuration file for monstache is provided in the root of this repository. Once running you can query it like so : 

```
# search contents
curl http://localhost:9200/avalon.contents/_search?q=football
# search accounts
curl http://localhost:9200/avalon.accounts/_search?q=satoshi
```

## Resetting and replaying the chain
Shut everything down, then `db.dropDatabase()` in mongo, and restart. This will do a complete replay and verification of the chain. Depending on your CPU/RAM it might be extremely slow and take a long time on a long chain with many transactions.

#### Replaying from a dump
An alternative way to resync your node faster is to use one of the backups provided by backup.d.tube. Example:

```
wget https://backup.d.tube/16.tar.gz
tar xfvz ./16.tar.gz
mongorestore -d avalon .
```

Will download and restore your avalon node up to 16:00 UTC.

## Being a good node owner
If you are in the top 20 node owners, please add a `node.ws` field to your profile as so:
```
node src/cli.js profile -K <key> -M <user> '{"node":{"ws":"ws://yourip:yourport"}}'
```
