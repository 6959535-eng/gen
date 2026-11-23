import { formatDateTime, JOURNAL_KIND_LABELS, type JournalItem, type JournalKind } from '@gen/shared';
import { View } from 'react-native';
import { Card, T } from './kit';
import { colors } from './theme';

const KIND_COLOR: Record<JournalKind, string> = {
  session: colors.ok,
  refuel: colors.accent,
  maintenance: colors.info,
  receipt: colors.ok,
  issue: colors.danger,
  inventory: colors.info,
};

export function JournalRow({ item, author, onPress, showDate }: {
  item: JournalItem;
  author: string;
  onPress: () => void;
  showDate?: boolean;
}) {
  return (
    <Card
      onPress={onPress}
      accent={item.flagged ? colors.warn : KIND_COLOR[item.kind]}
      style={item.flagged ? { backgroundColor: colors.warnDark } : undefined}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <T style={{ fontWeight: '700', flex: 1 }}>{item.title}</T>
        <T v="muted">{showDate ? formatDateTime(item.at) : formatDateTime(item.at).slice(11)}</T>
      </View>
      {item.details ? <T v="muted">{item.details}</T> : null}
      <T v="small">
        {JOURNAL_KIND_LABELS[item.kind]} · {author}
        {item.flagged ? ' · ⚠ відхилення витрати' : ''}
        {item.running ? ' · ▶ працює' : ''}
      </T>
    </Card>
  );
}
