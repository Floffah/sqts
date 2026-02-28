export default {
    trailingComma: "all",
    tabWidth: 4,
    semi: true,
    singleQuote: false,
    jsxSingleQuote: false,
    jsxBracketSameLine: false,
    arrowParens: "always",
    endOfLine: "lf",
    embeddedLanguageFormatting: "auto",

    importOrder: [
        "<TYPES>",
        "<THIRD_PARTY_MODULES>",
        "",
        "@/(.*)$",
        "",
        "^[.]",
    ],
    importOrderSortSpecifiers: true,
    importOrderGroupNamespaceSpecifiers: true,

    plugins: [
        "@ianvs/prettier-plugin-sort-imports",
    ]
};
