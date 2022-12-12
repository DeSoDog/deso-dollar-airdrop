import dotenv from "dotenv";
dotenv.config();
import { Deso } from "deso-protocol";
import express from "express";
import DB from "simple-json-db";
import axios from "axios";
// import {
//   DAO_COIN_USERNAME,
//   MinFeeRateNanosPerKB,
//   PK_THAT_HAVE_FAILED_TO_RECEIVE_AIR_DROP,
//   PK_THAT_HAVE_RECEIVED_AIR_DROP,
//   PORT,
//   PublicKey,
// } from "./constValues";
// import {
//   delay,
//   determineAmountToSend,
//   getAllCommentersFromPost,
//   getSenderPublicKey,
// } from "./utils";

export const PK_THAT_HAVE_RECEIVED_AIR_DROP: Readonly<Status> = "hasReceived";
export const PK_THAT_HAVE_FAILED_TO_RECEIVE_AIR_DROP: Readonly<Status> =
  "hasFailed";
export const POST_HASH_HEX_TO_COMMENT_ON: Readonly<PostHashHex> =
  "99cd89fc11d8432416d83ea73b72944a540dd27a996c8ac9c4a9c6379b136891"; // https://diamondapp.com/posts/99cd89fc11d8432416d83ea73b72944a540dd27a996c8ac9c4a9c6379b136891?feedTab=Hot
export const DAO_COIN_USERNAME: Readonly<string> = "DesoDollar";
// const AMOUNT_TO_SEND: Readonly<string> = "0xDE0B6B3A7640000"; // 1 dollar
export const AMOUNT_TO_SEND: Readonly<string> = "0x4563918244F40000"; // 5 dollar
export const AMOUNT_TO_SEND_OGS: Readonly<string> = "0x8AC7230489E80000"; //  10 dollars
export const AIRDROP_DB: Readonly<string> = "airdropUsers"; //  10 dollars
export const MinFeeRateNanosPerKB: Readonly<number> = 1000;
export const PORT: Readonly<number> = 3000;

// types
export type PublicKey = string;
export type PostHashHex = string;
export type Status = "hasReceived" | "hasFailed";

import { PostEntryResponse, GetSinglePostResponse } from "deso-protocol-types";
import { User } from "deso-protocol-types";

export const getOpenProsperInfo = async (publicKey: string) => {
  const response = await axios.post(
    "https://openprosperapi.xyz/api/v0/i/account-overview",
    {
      PublicKeyBase58: publicKey,
    },
    {
      headers: {
        "op-token": process.env.OPEN_PROSPER,
      },
    }
  );
  return response;
};
// import {
//   AMOUNT_TO_SEND,
//   AMOUNT_TO_SEND_OGS,
//   PK_THAT_HAVE_RECEIVED_AIR_DROP,
//   POST_HASH_HEX_TO_COMMENT_ON,
//   PublicKey,
// } from "./constValues";
export const ageStuff = async (db) => {
  const hasReceived: any[] = db.get("stats");
  const ages = {};
  hasReceived.forEach((pk) => {
    if (!ages[pk.data.value?.AccountAge.Days]) {
      ages[pk.data.value?.AccountAge.Days] = [pk.publicKey];
    } else {
      ages[pk.data.value?.AccountAge.Days].push(pk.publicKey);
    }
  });
  db.set("allAges", ages);
  return ages;
};
export const ageStuffNumber = (db) => {
  const ages = db.get("allAges");
  return Object.keys(ages).map((age) => {
    return { [age]: ages[age].length };
  });
};

export const totalReceivers = (db) => {
  const hasReceived: any[] = db.get("stats");
  const total = hasReceived.map((pk) => {
    return pk.data.value?.AccountAge.Days;
  });
  return total.length;
};

export const removeStuff = async (db) => {
  const hasReceived: any[] = db.get("stats");
  hasReceived.forEach((item) => {
    delete item.data.value.Followers;
  });
  console.log("done");
  db.set("stats", hasReceived);
};
export const totalOGs = async (db) => {
  const hasReceived: any[] = db.get("stats");
  const total = hasReceived
    .map((pk) => {
      return pk.data.value?.AccountAge.Days;
    })
    .filter((age) => {
      return age > 364;
    }).length;
  return total;
};

export const getStats = async (db): Promise<any[]> => {
  const hasReceived = db.get(PK_THAT_HAVE_RECEIVED_AIR_DROP) as PublicKey[];
  const stats = [];
  for await (const pk of hasReceived) {
    await delay(200);
    const response = await getOpenProsperInfo(pk);
    if (response.data) {
      console.log(response.data);
      stats.push({ publicKey: pk, data: response.data });
    }
    db.set("stats", stats);
  }
  return [];
  // return hasReceived.map((pk) => {
  //   return getOpenProsperInfo(pk);
  // });
};

export const getAllCommentersFromPost = async (
  deso: Deso,
  senderPK: PublicKey,
  CommentLimit = 30,
  CommentOffset = 0,
  existingComments: PostEntryResponse[] = []
): Promise<PostEntryResponse[]> => {
  console.log(existingComments.length);
  const response = await deso.posts.getSinglePost({
    PostHashHex: POST_HASH_HEX_TO_COMMENT_ON,
    CommentLimit,
    CommentOffset: CommentOffset,
  });

  if (response.PostFound.CommentCount === CommentOffset) {
    // base case, offset matches comment count
    const messages: any = {};
    const uniqueCommenters = [
      // remove duplicates PK's by briefly converting it to a set
      ...new Set(
        existingComments
          .filter((pk) => {
            messages[pk.PosterPublicKeyBase58Check] = pk;
            const includedDesoInBody = pk.Body.toLowerCase().includes("deso");
            return (
              pk.PosterPublicKeyBase58Check !== senderPK && includedDesoInBody
            );
          })
          .map((pk) => pk.PosterPublicKeyBase58Check)
      ),
    ].map((pk) => messages[pk]);
    return uniqueCommenters;
  }
  const amountToGet = Math.min(
    30,
    response.PostFound.CommentCount - CommentOffset
  );
  return getAllCommentersFromPost(
    deso,
    senderPK,
    amountToGet,
    CommentOffset + amountToGet,
    [...existingComments, ...(response.PostFound.Comments ?? [])]
  );
};

export const determineAmountToSend = async (
  commenter: PublicKey
): Promise<string> => {
  try {
    const response = await getOpenProsperInfo(commenter);
    const accountAge = response?.data?.value?.AccountAge.Days ?? 0;
    console.log("account age for:", commenter, accountAge);
    return accountAge > 364 ? AMOUNT_TO_SEND_OGS : AMOUNT_TO_SEND;
  } catch (e) {
    console.log(e);
    throw "unable to access open prosper api";
  }
};

export const delay = (t): Promise<true> => {
  return new Promise(function (resolve) {
    setTimeout(function () {
      resolve(true);
    }, t);
  });
};

export const getSenderPublicKey = (deso: Deso): PublicKey => {
  const keyPair = deso.utils.generateKeyFromSource({
    mnemonic: process.env.MNEMONIC,
  });
  const SenderPublicKeyBase58Check =
    deso.utils.privateKeyToDeSoPublicKey(keyPair);
  return SenderPublicKeyBase58Check;
};

const db = new DB("./db.json", { syncOnWrite: true });
const deso = new Deso({ identityConfig: { host: "server" } });
const app = express();
// functions
const setAirdropData = async () => {
  const eligibleUsers: AirdropUser[] = await db.get(AIRDROP_DB);
  let filteredUsers: AirdropUser[] = filterByComment(eligibleUsers);
  filteredUsers = await getAttributesFromUser(filteredUsers);
  db.set("filteredCommenters", filteredUsers);
  console.log("users total =>", eligibleUsers.length);
  console.log("users that used keyword => ", filteredUsers.length);
};
const senderPK = getSenderPublicKey(deso);
app.listen(PORT, async () => {
  const airdropUsers: AirdropUser[] = db.get(AIRDROP_DB);
  const removeBots: AirdropUser[] = airdropUsers.filter(
    (x) => x.Balance > 0.0015
  );
  distributeFunds(removeBots);
});
export interface AirdropUser {
  publicKey: PublicKey;
  Body: string;
  timeStamp: number;
  UserName: string;
  BalanceNanos: number;
  Balance: number;
}
const getAttributesFromUser = async (
  airdropUsers: AirdropUser[]
): Promise<AirdropUser[]> => {
  const users = await deso.user.getUserStateless({
    PublicKeysBase58Check: airdropUsers.map((pk) => pk.publicKey),
  });

  if (users.UserList.length) {
    const userObj = {};
    users.UserList.forEach((user: User) => {
      const { ProfileEntryResponse, BalanceNanos, PublicKeyBase58Check } = user;
      userObj[PublicKeyBase58Check] = {
        UserName: ProfileEntryResponse.Username,
        BalanceNanos,
        Balance: BalanceNanos / 1e9,
      };
    });
    return airdropUsers.map((user) => {
      return { ...user, ...userObj[user.publicKey] };
    });
  } else {
    return airdropUsers;
  }
};
const filterByComment = (airdropUsers: AirdropUser[]) => {
  const commentsThatIncludeKeyWord = airdropUsers.filter((airdropUser, i) => {
    return (
      airdropUser.Body.includes("deso") ||
      airdropUser.Body.includes("DESO") ||
      airdropUser.Body.includes("DeSo")
    );
  });
  return commentsThatIncludeKeyWord;
};
const getEligibleUsers = async (): Promise<Partial<AirdropUser>[]> => {
  console.log("starting");
  const uniqueCommenters = await getAllCommentersFromPost(deso, senderPK);
  const uniqueCommentersInformation: Partial<AirdropUser>[] = uniqueCommenters
    .map((pk) => {
      return {
        publicKey: pk.PosterPublicKeyBase58Check,
        Body: pk.Body,
        timeStamp: pk.TimestampNanos,
      };
    })
    .sort((a, b) => {
      return a.timeStamp - b.timeStamp;
    });
  return uniqueCommentersInformation;
};
const AIRDROP_HAS_RECEIVED = "airdropHasReceived";
const distributeFunds = async (publicKeysToReceiveAirdrop: AirdropUser[]) => {
  db.set(AIRDROP_HAS_RECEIVED, []);
  let remaining = publicKeysToReceiveAirdrop.length;
  console.log("begin sending funds to eligible users");
  for await (const airdropUser of publicKeysToReceiveAirdrop) {
    try {
      await sendFunds(airdropUser.publicKey);
      const hasReceived = db.get(AIRDROP_HAS_RECEIVED) as PublicKey[];
      hasReceived.push(airdropUser.publicKey);
      db.set(AIRDROP_HAS_RECEIVED, hasReceived);
      remaining = remaining - 1;
      console.log("successful for", airdropUser);
      console.log("requests remaining: ", remaining);
    } catch (e) {
      remaining = remaining - 1;
      console.log("requests remaining: ", remaining);
      console.log("failure for", airdropUser);
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
      MinFeeRateNanosPerKB,
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
      throw "error submitting transaction";
    }
    let hasNotBeenSubmitted = true;
    let attempts = 0;
    while (hasNotBeenSubmitted && attempts < 20) {
      await delay(2500);
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
