# Official airport seed

`official-airports.json` contains the eight records supplied by the user in
`Mock Data.xlsx`, sheet `Airports.csv!A1:E9`. The other three supplied Mock Data
workbooks contain the same reference records. These are reference datasets,
not the requirements workbook.

Mapping preserves `iata_code` as both `code` and `officialId` (the source has
no separate numeric airport identifier), `city_id` as `cityId`, `country_code`
as `countryCode`, and `time_zone` as `timeZone`. Human-readable city/country names
come from `Cities.csv!A1:C9` and `Countries.csv!A1:C9` in the same workbook.
No airport data was invented or fetched from an alternative dataset.

From `backend`, after a successful build:

```sh
node dist/p2/import-airports.js data/official-airports.json
```

The CLI reads local `MONGODB_URI` through dotenv, validates every row and IANA
zone before writing, and uses unique indexes on `officialId` and `code`.
`$setOnInsert` preserves existing records. Repeated imports do not duplicate or
overwrite them. An identifier conflict fails; resolve it with the team leader,
never delete the shared collection. An interrupted/conflicting batch can leave
earlier inserts in place; it is safe to rerun after resolving the conflict.
There is no public import endpoint or automatic database reset.

The isolated integration suite imports this exact file twice and checks eight
records plus preservation of official identifiers. Shared Atlas import attempts
did not succeed in this session; run the command after connectivity is restored.
