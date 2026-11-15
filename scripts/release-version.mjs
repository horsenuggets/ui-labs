import { log } from "node:console";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import ts from "typescript";

function property(object, name) {
	const matches = object.properties.filter((entry) => ts.isPropertyAssignment(entry) && entry.name.getText() === name);
	if (matches.length !== 1) throw new Error(`Expected one "${name}" version property.`);
	return matches[0].initializer;
}

export function getReleaseVersion(source, requested) {
	if (!requested) throw new Error("A release version is required.");
	const file = ts.createSourceFile("Configs.ts", source, ts.ScriptTarget.Latest, true);
	if (file.parseDiagnostics.length !== 0) throw new Error("The plugin configuration has invalid syntax.");
	const declarations = file.statements
		.filter(ts.isVariableStatement)
		.flatMap((statement) => statement.declarationList.declarations)
		.filter((declaration) => declaration.name.getText() === "Configs");
	if (
		declarations.length !== 1 ||
		!declarations[0].initializer ||
		!ts.isObjectLiteralExpression(declarations[0].initializer)
	) {
		throw new Error("Expected one literal Configs object.");
	}
	const version = property(declarations[0].initializer, "Version");
	if (!ts.isObjectLiteralExpression(version)) throw new Error("Expected a literal Version object.");
	const numbers = ["Mayor", "Minor", "Fix"].map((name) => {
		const value = property(version, name);
		if (
			!ts.isNumericLiteral(value) ||
			!/^(0|[1-9]\d*)$/.test(value.text) ||
			!Number.isSafeInteger(Number(value.text))
		) {
			throw new Error(`Expected a nonnegative integer for "${name}".`);
		}
		return value.text;
	});
	const suffix = property(version, "ForkSuffix");
	if (!ts.isStringLiteral(suffix) || !/^-horse\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(suffix.text)) {
		throw new Error("Expected a horse release suffix.");
	}
	const actual = `${numbers.join(".")}${suffix.text}`;
	if (requested !== actual)
		throw new Error(`Requested version "${requested}" does not match plugin version "${actual}".`);
	return actual;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const source = readFileSync(new URL("../src/Plugin/Configs.ts", import.meta.url), "utf8");
	log(`version=${getReleaseVersion(source, process.argv[2])}`);
}
