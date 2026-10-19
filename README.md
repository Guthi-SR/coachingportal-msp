# Coachingportal MSP

Internes Coachingportal: https://coachingportal-msp.vercel.app/

## Arbeitsstand vom 19.10.2026

- Schiedsrichter- und Coach-Untermenüs in der linken Navigation.
- Alle Beobachtungsbögen in einer chronologischen Übersicht (nach Spieldatum, neueste zuerst). PDF nur in separatem Fenster.
- Spiele mit Status „Bogen eingegangen“, „Bogen geprüft“, „Bogen bereits versendet“ (Datum und Notiz).
- Ampelfarben: Grün bei Versand, Gelb bis fünf Tage vor dem Spiel, Rot fünf Tage nach einem Spiel ohne Bogeneingang.
- Bei Rot manuelle E-Mail-Erinnerung an den zugeordneten Coach mit bearbeitbarem Text und Dreitagesfrist.
- Beobachtungsbogen-Versand an den Schiedsrichter mit dem zugeordneten PDF als Anhang.
- Täglicher Server-Prüflauf: an Tag fünf nach dem Spiel Erinnerung an den Portaladmin, falls kein Bogen als eingegangen markiert ist. Zwei Folgetage als Nachholfenster.
- Personenadresse und Vornamen kommen aus den vorhandenen Stammdaten im Browser und werden beim Aufrufen der Spielliste in die geschützte Portal-Datenbank übernommen.

## Wichtig: Einmalige E-Mail-Konfiguration

Diese vier serverseitigen Umgebungsvariablen müssen in **Vercel → coachingportal-msp → Settings → Environment Variables** für **Production** hinterlegt werden. Die tatsächliche Einrichtung erfolgt im Nutzerkonto, nicht im Repository.

| Variable | Verwendung |
| --- | --- |
| `RESEND_API_KEY` | Schlüssel des für die Domain freigeschalteten Maildiensts Resend |
| `PORTAL_MAIL_FROM` | Bestätigte Absenderadresse des Administrators (z. B. `Coachingportal <coaching@eigene-domain.de>`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Geheimer Supabase-Serverschlüssel nur für die tägliche Abfrage; niemals in Client-Dateien veröffentlichen |
| `CRON_SECRET` | Langes zufälliges Geheimnis, das Vercel als Bearer-Token für Cron-Aufrufe nutzt |

Ohne Resend-Konfiguration werden **keine E-Mails** gesendet; die Oberfläche meldet das bei einem Versandversuch. Nach der Einrichtung ist eine neue Produktionsbereitstellung erforderlich. Ausgehende E-Mails verwenden die bestätigte Admin-Absenderadresse und nutzen die Admin-Profiladresse als Antwortadresse.

Die persönliche E-Mail-Signatur wird später ergänzt, sobald die Angaben vorliegen.

## Datenspeicherung

Die bisherigen Spiel-, Coach-, Schiedsrichter- und PDF-Daten liegen zunächst in `localStorage` bzw. `IndexedDB` des erstellenden Browsers. Beim Aufruf von „Spiele“ oder „Beobachtungsbögen“ werden zugeordnete Inhalte über die angemeldete Admin-Sitzung in `public.portal_games` / `public.portal_observations` und den privaten Storage-Bucket `portal-observation-pdfs` kopiert. Der erste Abgleich muss im bisherigen Browser erfolgen. Alte lokale Dateien werden dabei nicht gelöscht.

Die PDF-Dokumente sind über RLS auf den Admin beschränkt. Eine vollständig browserunabhängige Personen-Stammdatenverwaltung ist eine separate spätere Aufgabe.

## Nach Veröffentlichung testen

1. Im bisher genutzten Browser anmelden. Spiele und Bögen öffnen, damit die privaten PDFs synchronisiert werden.
2. In beiden Profiltypen auf das Buch klicken. Nur der reine PDF-Bogen muss im neuen Tab erscheinen.
3. „Bogen eingegangen“ und „Bogen geprüft“ kontrollieren.
4. „Bereits versendet“ mit Datum und Notiz erproben.
5. Gelb/Rot/Grün an einem datierten Testspiel kontrollieren.
6. Bogenübersicht auf absteigende Spieltermine prüfen.
7. Nach der Mail-Konfiguration Vorschau und manuelle Erinnerungsfunktion mit einem eigenen Testdatensatz verifizieren.
8. Den Cron-Prüflauf anhand des Logs und des eingetragenen Erinnerungszeitpunkts bestätigen.

