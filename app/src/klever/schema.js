/*
 * schema.js — what each part of a Klever transaction means
 * ========================================================
 *
 * These are the "maps" our reader (protobuf.js) uses to understand
 * transactions. They're copied from the official definitions in the Klever
 * node's own source code, so they match exactly what the network does:
 *
 *   github.com/klever-io/klever-go, data/transaction/proto/transaction.proto
 *   and contracts.proto (checked at commit 24e0c1d, 24 Sep 2026)
 *
 * IMPORTANT: we only list what the Signer can read and explain. Anything not
 * listed here (for example the parts of a transaction that only exist AFTER
 * it's been processed, like results and receipts) is refused by the reader.
 * When we teach the Signer a new kind of transaction later, its map is added
 * here, together with tests.
 */

/** A token amount with the token it's paid in (used for "fee paid in another token"). */
export const KDAFeeSchema = {
  name: 'fee setting',
  fields: {
    1: { name: 'KDA', type: 'bytes' },
    2: { name: 'Amount', type: 'int64' },
  },
};

/**
 * TransferContract — "send an amount of a token (or an NFT) to an address".
 * Note the order: ToAddress = 1, AssetID = 2, Amount = 3. Klever's JavaScript
 * library has these mixed up. The node (and this file) has them right.
 */
export const TransferContractSchema = {
  name: 'transfer',
  fields: {
    1: { name: 'ToAddress', type: 'bytes' },
    2: { name: 'AssetID', type: 'bytes' },   // empty = KLV
    3: { name: 'Amount', type: 'int64' },
    4: { name: 'KDARoyalties', type: 'int64' },
    5: { name: 'KLVRoyalties', type: 'int64' },
  },
};

/** "Any" — a wrapper saying which kind of contract is inside, plus its bytes. */
export const AnySchema = {
  name: 'contract wrapper',
  fields: {
    1: { name: 'TypeUrl', type: 'string' },
    2: { name: 'Value', type: 'bytes' },
  },
};

/** TXContract — one instruction in a transaction (a transaction can hold several). */
export const TXContractSchema = {
  name: 'contract',
  fields: {
    1: { name: 'Type', type: 'enum' },
    2: { name: 'Parameter', type: 'message', schema: AnySchema },
  },
};

/** Raw — the part of a transaction that gets signed. */
export const RawSchema = {
  name: 'transaction',
  fields: {
    1: { name: 'Nonce', type: 'uint64' },         // the sender's transaction counter
    2: { name: 'Sender', type: 'bytes' },          // sender's public key (32 bytes)
    6: { name: 'Contract', type: 'message', schema: TXContractSchema, repeated: true },
    7: { name: 'PermissionID', type: 'int32' },    // 0 = normal owner signature
    10: { name: 'Data', type: 'bytes', repeated: true }, // optional notes ("memo")
    13: { name: 'KAppFee', type: 'int64' },        // fee, in KLV's smallest unit
    14: { name: 'BandwidthFee', type: 'int64' },   // fee, in KLV's smallest unit
    15: { name: 'Version', type: 'uint32' },
    16: { name: 'ChainID', type: 'bytes' },        // "108" = mainnet, "109" = testnet
    17: { name: 'KDAFee', type: 'message', schema: KDAFeeSchema },
  },
};

/**
 * UnsignedTransactionSchema — what a client app sends to the Signer:
 * a Transaction that contains ONLY its RawData (field 1). A transaction that
 * already carries signatures, results or receipts is refused.
 */
export const UnsignedTransactionSchema = {
  name: 'transaction package',
  fields: {
    1: { name: 'RawData', type: 'message', schema: RawSchema },
  },
};

/** Contract type numbers, from the node's TXContract.ContractType list. */
export const CONTRACT_TYPES = {
  TRANSFER: 0n,
};

/** The wrapper label that must accompany a transfer. */
export const TRANSFER_TYPE_URL = 'type.googleapis.com/proto.TransferContract';
