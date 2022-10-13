import dotenv from "dotenv";
dotenv.config();
import { Deso } from "deso-protocol";
import { PostEntryResponse } from "deso-protocol-types";
import express from "express";
import DB from "simple-json-db";
import axios from "axios";
// types
type PublicKey = string;
type PostHashHex = string;
type Status = "hasReceived" | "hasFailed";
// constants
const PK_THAT_HAVE_RECEIVED_AIR_DROP: Readonly<Status> = "hasReceived";
const PK_THAT_HAVE_FAILED_TO_RECEIVE_AIR_DROP: Readonly<Status> = "hasFailed";
const POST_HASH_HEX_TO_COMMENT_ON: Readonly<PostHashHex> =
  "324d14bf3ac4d8c993662899ee894c18a606df07ff5e37cb48ca33fcc5bf6fb2"; // https://diamondapp.com/posts/16ecd506f5aaa9649886632d428d82af12bfaba89bad3e372a6a1b02a82a234a?tab=posts
const DAO_COIN_USERNAME: Readonly<string> = "DesoDollar";
const AMOUNT_TO_SEND: Readonly<string> = "0xDE0B6B3A7640000"; // 1 dollar
const AMOUNT_TO_SEND_OGS: Readonly<string> = "0x8AC7230489E80000"; //  10 dollars
const MinFeeRateNanosPerKB: Readonly<number> = 1000;
const PORT: Readonly<number> = 3000;
// services
const db = new DB("./db.json", { syncOnWrite: true });
const deso = new Deso({ identityConfig: { host: "server" } });
const app = express();
// functions
const getSenderPublicKey = () => {
  const keyPair = deso.utils.generateKeyFromSource({
    mnemonic: process.env.MNEMONIC,
  });
  const SenderPublicKeyBase58Check =
    deso.utils.privateKeyToDeSoPublicKey(keyPair);
  return SenderPublicKeyBase58Check;
};
const senderPK = getSenderPublicKey();
const getAllCommentersFromPost = async (
  CommentLimit = 30,
  CommentOffset = 0,
  existingComments: PostEntryResponse[] = []
): Promise<PublicKey[]> => {
  const response = await deso.posts.getSinglePost({
    PostHashHex: POST_HASH_HEX_TO_COMMENT_ON,
    CommentLimit,
    CommentOffset: CommentOffset,
  });
  if (response.PostFound.CommentCount === CommentOffset) {
    // base case, offset matches comment count
    return [
      // remove duplicates PK's by briefly converting it to a set
      ...new Set(
        existingComments
          .filter((pk) => {
            return pk.PosterPublicKeyBase58Check !== senderPK;
          })
          .map((c) => c.PosterPublicKeyBase58Check)
      ),
    ];
  }
  const amountToGet = Math.min(
    30,
    response.PostFound.CommentCount - CommentOffset
  );
  console.log(existingComments.length);
  return getAllCommentersFromPost(amountToGet, CommentOffset + amountToGet, [
    ...existingComments,
    ...(response.PostFound.Comments ?? []),
  ]);
  // def add pagination
};
app.listen(PORT, async () => {
  db.set(PK_THAT_HAVE_RECEIVED_AIR_DROP, []);
  db.set(PK_THAT_HAVE_FAILED_TO_RECEIVE_AIR_DROP, []);
  console.log("starting");
  const publicKeys = await getAllCommentersFromPost();
  console.log(publicKeys);
  distributeFunds(publicKeys)
    .then()
    .catch((e) => {
      console.log(e);
    });
});

const distributeFunds = async (publicKeysToReceiveAirdrop: PublicKey[]) => {
  let remaining = publicKeysToReceiveAirdrop.length;
  console.log("begin sending funds to eligible users");
  for await (const pk of publicKeysToReceiveAirdrop) {
    try {
      await sendFunds(pk);
      const hasReceived = db.get(PK_THAT_HAVE_RECEIVED_AIR_DROP) as PublicKey[];
      hasReceived.push(pk);
      db.set(PK_THAT_HAVE_RECEIVED_AIR_DROP, hasReceived);
      remaining = remaining - 1;
      console.log("successful for", pk);
      console.log("requests remaining: ", remaining);
    } catch (e) {
      const hasFailed = db.get(
        PK_THAT_HAVE_FAILED_TO_RECEIVE_AIR_DROP
      ) as PublicKey[];
      hasFailed.push(pk);
      db.set(PK_THAT_HAVE_FAILED_TO_RECEIVE_AIR_DROP, hasFailed);
      remaining = remaining - 1;
      console.log("requests remaining: ", remaining);
      console.log("failure for", pk);
    }
  }
};

const sendFunds = async (commenter: PublicKey): Promise<boolean> => {
  // additional check incase they left multiple comments
  if (db.get(PK_THAT_HAVE_RECEIVED_AIR_DROP)?.includes(commenter)) {
    throw `${commenter} already received`;
  }
  try {
    const keyPair = deso.utils.generateKeyFromSource({
      mnemonic: process.env.MNEMONIC,
    });
    const SenderPublicKeyBase58Check =
      deso.utils.privateKeyToDeSoPublicKey(keyPair);
    const amountToSend = await determineAmountToSend(commenter);
    const transaction = await deso.dao.transferDAOCoin({
      ReceiverPublicKeyBase58CheckOrUsername: commenter,
      SenderPublicKeyBase58Check,
      DAOCoinToTransferNanos: amountToSend,
      MinFeeRateNanosPerKB: MinFeeRateNanosPerKB,
      ProfilePublicKeyBase58CheckOrUsername: DAO_COIN_USERNAME,
    });
    if (!transaction) {
      throw "no transaction found";
    }
    const signedTransactionHex = await deso.utils.signMessageLocally({
      keyPair,
      transactionHex: transaction.TransactionHex,
    });
    const response = await deso.transaction
      .submitTransaction(signedTransactionHex)
      .catch((e) => console.log(e));
    if (!response) {
      return;
    }
    let hasNotBeenSubmitted = true;
    let attempts = 0;
    while (hasNotBeenSubmitted && attempts < 20) {
      await delay(2000);
      const transaction = await deso.transaction
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
  } catch (e) {
    throw `something went wrong when sending to ${commenter} `;
  }
};
const determineAmountToSend = async (commenter: PublicKey): Promise<string> => {
  try {
    const response = await axios.post(
      "https://openprosperapi.xyz/api/v0/i/account-overview",
      {
        PublicKeyBase58: commenter,
      },
      {
        headers: {
          "op-token": "U2FsdGVkX197EFYz9VzwvpcJvimHv4OejcU5LS0534o=''",
        },
      }
    );
    const accountAge = response?.data?.value?.AccountAge.Days ?? 0;
    console.log("account age for:", commenter, accountAge);
    return accountAge > 364 ? AMOUNT_TO_SEND_OGS : AMOUNT_TO_SEND;
  } catch (e) {
    console.log(e);
    throw "unable to access open prosper api";
  }
};

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
