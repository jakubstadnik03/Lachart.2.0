/**
 * Store activity streams in their packed binary form, transparently.
 *
 * The point of doing this as a plugin rather than at each call site is that
 * there are eighteen of them — eight writers and ten readers, across routes,
 * controllers, services and utils — and a codec that only some of them know
 * about is a codec that will eventually be bypassed by the nineteenth. Here the
 * decision is made once, in the one place every query already passes through.
 *
 * Readers keep receiving `doc.streams` as the plain { key: [...] } object they
 * always did, so nothing downstream changes. Writers keep sending
 * `$set: { streams }`. What lands in Mongo is `packed` — see utils/streamCodec.
 *
 * Legacy documents that still carry `streams` are served straight from it; the
 * migration script rewrites them in the background and the two forms coexist
 * safely until it finishes.
 */

'use strict';

const mongoose = require('mongoose');
const { packStreams, unpackStreams } = require('../utils/streamCodec');

/** Give a document read out of Mongo its `streams` back. */
function inflate(doc) {
  if (!doc || typeof doc !== 'object') return;
  // A legacy document carries the real thing already — prefer it.
  if (doc.streams && Object.keys(doc.streams).length) return;
  if (!doc.packed) return;
  const streams = unpackStreams(doc.packed);
  if (streams) doc.streams = streams;
}

/** Rewrite an update that sets `streams` into one that sets `packed`. */
function packUpdate(query) {
  const update = query.getUpdate();
  if (!update || Array.isArray(update)) return; // aggregation-pipeline updates are not ours

  const holder = update.$set && 'streams' in update.$set
    ? update.$set
    : ('streams' in update ? update : null);
  if (!holder) return;

  const packed = packStreams(holder.streams);
  delete holder.streams;
  if (packed) holder.packed = packed;

  // $set and $unset must not name the same path, hence the delete above: a
  // legacy document being rewritten has to lose its old `streams`, or the two
  // representations sit side by side and inflate() keeps preferring the stale
  // one.
  // setDefaultsOnInsert can put the schema default for this path into
  // $setOnInsert; $unset of the same path would then be rejected outright.
  if (update.$setOnInsert) delete update.$setOnInsert.streams;
  update.$unset = { ...(update.$unset || {}), streams: '' };
  query.setUpdate(update);
}

module.exports = function streamStorage(schema) {
  schema.add({
    /** Packed channels — see utils/streamCodec. Written in place of `streams`. */
    packed: { type: mongoose.Schema.Types.Mixed, default: undefined },
  });

  schema.post('find', function (docs) {
    if (Array.isArray(docs)) docs.forEach(inflate);
  });
  schema.post('findOne', inflate);
  schema.post('findOneAndUpdate', inflate);

  const asQuery = { query: true, document: false };
  schema.pre('updateOne', asQuery, function () { packUpdate(this); });
  schema.pre('updateMany', asQuery, function () { packUpdate(this); });
  schema.pre('findOneAndUpdate', asQuery, function () { packUpdate(this); });

  // Nothing calls save() on a stream today, but a document that came back
  // inflated would otherwise write the unpacked arrays straight back.
  schema.pre('save', function () {
    if (!this.streams || !Object.keys(this.streams).length) return;
    const packed = packStreams(this.streams);
    if (!packed) return;
    this.packed = packed;
    this.set('streams', undefined);
  });
};

module.exports.inflate = inflate;
