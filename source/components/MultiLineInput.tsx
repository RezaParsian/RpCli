import React, {useRef} from 'react';
import {Text, useInput} from 'ink';

type Props = {
	value: string;
	onChange: (value: string) => void;
	onSubmit: (value: string) => void;
	placeholder?: string;
};

export default function MultiLineInput({
	value,
	onChange,
	onSubmit,
	placeholder = '',
}: Props) {
	const currentValue = useRef(value);
	currentValue.current = value;

	const updateValue = (nextValue: string) => {
		currentValue.current = nextValue;
		onChange(nextValue);
	};

	useInput((input, key) => {
		if (key.return && key.ctrl) {
			onSubmit(currentValue.current);
			return;
		}

		if (key.return) {
			updateValue(`${currentValue.current}\n`);
			return;
		}

		if (key.backspace || key.delete) {
			updateValue(currentValue.current.slice(0, -1));
			return;
		}

		if (
			key.ctrl ||
			key.meta ||
			key.escape ||
			key.tab ||
			key.upArrow ||
			key.downArrow ||
			key.leftArrow ||
			key.rightArrow ||
			key.home ||
			key.end ||
			key.pageUp ||
			key.pageDown
		) {
			return;
		}

		updateValue(currentValue.current + input);
	});

	if (!value) {
		return (
			<Text>
				<Text inverse> </Text>
				<Text dimColor>{placeholder}</Text>
			</Text>
		);
	}

	return (
		<Text>
			{value}
			<Text inverse> </Text>
		</Text>
	);
}
