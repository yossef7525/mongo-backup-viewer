import type { CollectionSummary } from '../worker/protocol';

export function CollectionView({ collection }: { collection: CollectionSummary }) {
  return <p>{collection.key}</p>;
}
