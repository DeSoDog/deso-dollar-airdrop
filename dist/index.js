var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
import dotenv from "dotenv";
dotenv.config();
import { Deso } from "deso-protocol";
import express from "express";
import DB from "simple-json-db";
import axios from "axios";
// constants
const PK_THAT_HAVE_RECEIVED_AIR_DROP = "hasReceived";
const PK_THAT_HAVE_FAILED_TO_RECEIVE_AIR_DROP = "hasFailed";
const POST_HASH_HEX_TO_COMMENT_ON = "16ecd506f5aaa9649886632d428d82af12bfaba89bad3e372a6a1b02a82a234a"; // https://diamondapp.com/posts/16ecd506f5aaa9649886632d428d82af12bfaba89bad3e372a6a1b02a82a234a?tab=posts
const DAO_COIN_USERNAME = "DesoDollar";
const AMOUNT_TO_SEND = "0x1"; // 1 dollar
const AMOUNT_TO_SEND_OGS = "0x32"; //  5 dollars
const MinFeeRateNanosPerKB = 1000;
const PORT = 3000;
// services
const db = new DB("./db.json", { syncOnWrite: true });
const deso = new Deso({ identityConfig: { host: "server" } });
const app = express();
// functions
const getSenderPublicKey = () => {
    const keyPair = deso.utils.generateKeyFromSource({
        mnemonic: process.env.MNEMONIC,
    });
    const SenderPublicKeyBase58Check = deso.utils.privateKeyToDeSoPublicKey(keyPair);
    return SenderPublicKeyBase58Check;
};
const senderPK = getSenderPublicKey();
const getAllCommentersFromPost = (CommentLimit = 30, CommentOffset = 0, existingComments = []) => __awaiter(void 0, void 0, void 0, function* () {
    const response = yield deso.posts.getSinglePost({
        PostHashHex: POST_HASH_HEX_TO_COMMENT_ON,
        CommentLimit,
        CommentOffset: CommentOffset,
    });
    if (response.PostFound.CommentCount === CommentOffset) {
        // base case, offset matches comment count
        return [
            // remove duplicates PK's by briefly converting it to a set
            ...new Set(existingComments
                .filter((pk) => {
                return pk.PosterPublicKeyBase58Check !== senderPK;
            })
                .map((c) => c.PosterPublicKeyBase58Check)),
        ];
    }
    const amountToGet = Math.min(30, response.PostFound.CommentCount - CommentOffset);
    console.log(amountToGet);
    return getAllCommentersFromPost(amountToGet, CommentOffset + amountToGet, [
        ...existingComments,
        ...response.PostFound.Comments,
    ]);
    // def add pagination
});
app.listen(PORT, () => __awaiter(void 0, void 0, void 0, function* () {
    db.set(PK_THAT_HAVE_RECEIVED_AIR_DROP, []);
    db.set(PK_THAT_HAVE_FAILED_TO_RECEIVE_AIR_DROP, []);
    const publicKeys = yield getAllCommentersFromPost();
    distributeFunds(publicKeys)
        .then()
        .catch((e) => {
        console.log(e);
    });
}));
const distributeFunds = (publicKeysToReceiveAirdrop) => { var publicKeysToReceiveAirdrop_1, publicKeysToReceiveAirdrop_1_1; return __awaiter(void 0, void 0, void 0, function* () {
    var e_1, _a;
    let remaining = publicKeysToReceiveAirdrop.length;
    console.log("begin sending funds to eligible users");
    try {
        for (publicKeysToReceiveAirdrop_1 = __asyncValues(publicKeysToReceiveAirdrop); publicKeysToReceiveAirdrop_1_1 = yield publicKeysToReceiveAirdrop_1.next(), !publicKeysToReceiveAirdrop_1_1.done;) {
            const pk = publicKeysToReceiveAirdrop_1_1.value;
            try {
                yield sendFunds(pk);
                const hasReceived = db.get(PK_THAT_HAVE_RECEIVED_AIR_DROP);
                hasReceived.push(pk);
                db.set(PK_THAT_HAVE_RECEIVED_AIR_DROP, hasReceived);
                remaining = remaining - 1;
                console.log("successful for", pk);
                console.log("requests remaining: ", remaining);
            }
            catch (e) {
                const hasFailed = db.get(PK_THAT_HAVE_FAILED_TO_RECEIVE_AIR_DROP);
                hasFailed.push(pk);
                db.set(PK_THAT_HAVE_FAILED_TO_RECEIVE_AIR_DROP, hasFailed);
                remaining = remaining - 1;
                console.log("requests remaining: ", remaining);
                console.log("failure for", pk);
            }
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (publicKeysToReceiveAirdrop_1_1 && !publicKeysToReceiveAirdrop_1_1.done && (_a = publicKeysToReceiveAirdrop_1.return)) yield _a.call(publicKeysToReceiveAirdrop_1);
        }
        finally { if (e_1) throw e_1.error; }
    }
}); };
const sendFunds = (commenter) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    // additional check incase they left multiple comments
    if ((_a = db.get(PK_THAT_HAVE_RECEIVED_AIR_DROP)) === null || _a === void 0 ? void 0 : _a.includes(commenter)) {
        throw `${commenter} already received`;
    }
    try {
        const keyPair = deso.utils.generateKeyFromSource({
            mnemonic: process.env.MNEMONIC,
        });
        const SenderPublicKeyBase58Check = deso.utils.privateKeyToDeSoPublicKey(keyPair);
        const amountToSend = yield determineAmountToSend(commenter);
        const transaction = yield deso.dao.transferDAOCoin({
            ReceiverPublicKeyBase58CheckOrUsername: commenter,
            SenderPublicKeyBase58Check,
            DAOCoinToTransferNanos: amountToSend,
            MinFeeRateNanosPerKB: MinFeeRateNanosPerKB,
            ProfilePublicKeyBase58CheckOrUsername: DAO_COIN_USERNAME,
        });
        if (!transaction) {
            throw "no transaction found";
        }
        const signedTransactionHex = yield deso.utils.signMessageLocally({
            keyPair,
            transactionHex: transaction.TransactionHex,
        });
        const response = yield deso.transaction
            .submitTransaction(signedTransactionHex)
            .catch((e) => console.log(e));
        if (!response) {
            return;
        }
        let hasNotBeenSubmitted = true;
        let attempts = 0;
        while (hasNotBeenSubmitted && attempts < 20) {
            yield delay(2000);
            const transaction = yield deso.transaction
                .getTransaction(response.TxnHashHex)
                .catch(() => console.log("oy"));
            if (transaction) {
                hasNotBeenSubmitted = !transaction.TxnFound;
            }
            attempts++;
        }
        if (attempts === 20) {
            throw `failed to find transaction for ${commenter}`;
        }
        return true;
    }
    catch (e) {
        throw `something went wrong when sending to ${commenter} `;
    }
});
const determineAmountToSend = (commenter) => __awaiter(void 0, void 0, void 0, function* () {
    var _b, _c, _d;
    try {
        const response = yield axios.post("https://openprosperapi.xyz/api/v0/i/account-overview", {
            PublicKeyBase58: commenter,
        }, {
            headers: {
                "op-token": "U2FsdGVkX197EFYz9VzwvpcJvimHv4OejcU5LS0534o=''",
            },
        });
        const accountAge = (_d = (_c = (_b = response === null || response === void 0 ? void 0 : response.data) === null || _b === void 0 ? void 0 : _b.value) === null || _c === void 0 ? void 0 : _c.AccountAge.Days) !== null && _d !== void 0 ? _d : 0;
        console.log("account age for:", commenter, accountAge);
        return accountAge > 365 ? AMOUNT_TO_SEND_OGS : AMOUNT_TO_SEND;
    }
    catch (e) {
        console.log(e);
        return AMOUNT_TO_SEND; // something went wrong talking to open prosper let's just send them the default amount?
    }
});
// note no longer need this but keeping it here because its a good reference on how to query twitter
// const doTwitterThings = async () => {
//   let client: Client = await setClient();
//   const meh = await client.tweets.tweetsRecentSearch({
//     query: "conversation_id:1579991807940853760",
//     "tweet.fields": [
//       "in_reply_to_user_id",
//       "author_id",
//       "created_at",
//       "conversation_id",
//     ],
//   });
// };
function delay(t) {
    return new Promise(function (resolve) {
        setTimeout(function () {
            resolve(true);
        }, t);
    });
}
//# sourceMappingURL=index.js.map