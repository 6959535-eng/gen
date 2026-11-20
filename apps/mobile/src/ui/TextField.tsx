import { TextInput } from 'react-native';
import { colors, size } from './theme';

export function TextField({
  value,
  onChangeText,
  placeholder,
  multiline,
  autoFocus,
  maxLength = 500,
  secure,
  autoCapitalize,
  keyboardType,
}: {
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
  multiline?: boolean;
  autoFocus?: boolean;
  maxLength?: number;
  secure?: boolean;
  autoCapitalize?: 'none' | 'characters' | 'sentences' | 'words';
  keyboardType?: 'default' | 'url';
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      multiline={multiline}
      autoFocus={autoFocus}
      maxLength={maxLength}
      secureTextEntry={secure}
      autoCapitalize={autoCapitalize ?? (secure ? 'none' : 'sentences')}
      autoCorrect={!secure && !autoCapitalize}
      keyboardType={keyboardType ?? 'default'}
      style={{
        minHeight: multiline ? 96 : size.touch,
        borderRadius: size.radius,
        borderWidth: 2,
        borderColor: colors.border,
        backgroundColor: colors.surface2,
        color: colors.text,
        fontSize: 20,
        paddingHorizontal: 14,
        paddingVertical: 10,
        textAlignVertical: multiline ? 'top' : 'center',
      }}
    />
  );
}
