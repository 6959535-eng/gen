import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { formatDateTime, TIME_ZONE } from '@gen/shared';
import { useState } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import { Button, T } from './kit';
import { colors, size } from './theme';

/** Дата й час (24 год, Europe/Kyiv). На Android — системні діалоги дати, потім часу. */
export function DateTimeField({
  label,
  value,
  onChange,
  maximumDate,
}: {
  label: string;
  value: number;
  onChange: (ms: number) => void;
  maximumDate?: number;
}) {
  const [iosOpen, setIosOpen] = useState(false);
  const [draft, setDraft] = useState(new Date(value));

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: new Date(value),
        mode: 'date',
        timeZoneName: TIME_ZONE,
        maximumDate: maximumDate ? new Date(maximumDate) : undefined,
        onChange: (e, date) => {
          if (e.type !== 'set' || !date) return;
          DateTimePickerAndroid.open({
            value: date,
            mode: 'time',
            is24Hour: true,
            timeZoneName: TIME_ZONE,
            onChange: (e2, dt) => {
              if (e2.type === 'set' && dt) onChange(dt.getTime());
            },
          });
        },
      });
    } else {
      setDraft(new Date(value));
      setIosOpen(true);
    }
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={open}
        style={{
          minHeight: size.touch,
          borderRadius: size.radius,
          borderWidth: 2,
          borderColor: colors.border,
          backgroundColor: colors.surface2,
          paddingHorizontal: 14,
          justifyContent: 'center',
        }}
      >
        <T v="small">{label}</T>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>{formatDateTime(value)}</Text>
      </Pressable>
      {Platform.OS === 'ios' ? (
        <Modal visible={iosOpen} transparent animationType="fade" onRequestClose={() => setIosOpen(false)}>
          <View style={{ flex: 1, backgroundColor: '#000a', justifyContent: 'center', padding: size.pad }}>
            <View style={{ backgroundColor: colors.surface, borderRadius: size.radius, padding: size.pad, gap: size.gap }}>
              <DateTimePicker
                value={draft}
                mode="datetime"
                display="inline"
                locale="uk-UA"
                timeZoneName={TIME_ZONE}
                themeVariant="dark"
                maximumDate={maximumDate ? new Date(maximumDate) : undefined}
                onValueChange={(_, d) => setDraft(d)}
              />
              <Button
                title="Готово"
                onPress={() => {
                  onChange(draft.getTime());
                  setIosOpen(false);
                }}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}
