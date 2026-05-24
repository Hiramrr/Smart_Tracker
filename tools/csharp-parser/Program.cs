using System.Globalization;
using System.Text.Json;
using FortniteReplayReader;
using FortniteReplayReader.Models;
using FortniteReplayReader.Models.Events;
using Unreal.Core.Models.Enums;

var options = CliOptions.Parse(args);

if (options.Help)
{
    Console.WriteLine("""
Uso:
  npm run parse:csharp -- [--input ruta] [--output data-csharp] [--player-id id] [--mode Normal]

Ejemplos:
  npm run parse:csharp
  npm run parse:csharp -- --input "./replays" --output "./data-csharp"
  npm run parse:csharp -- --player-id EFB4EAF1EBF54C2C9C78C3C7983BFBC0

Modos:
  EventsOnly, Minimal, Normal, Full
""");
    return;
}

var replayFiles = FindReplayFiles(options.Input).ToList();
if (replayFiles.Count == 0)
{
    Console.Error.WriteLine($"No encontre archivos .replay en: {Path.GetFullPath(options.Input)}");
    Environment.Exit(1);
}

Directory.CreateDirectory(options.Output);

Console.WriteLine($"Procesando {replayFiles.Count} replay(s) con FortniteReplayReader ({options.Mode})...\n");

var parsedMatches = new List<ParsedMatch>();
var parsedEliminations = new List<ParsedElimination>();
var playerCandidates = new Dictionary<string, PlayerCandidate>(StringComparer.OrdinalIgnoreCase);

foreach (var replayFile in replayFiles)
{
    var parsed = ParseReplay(replayFile, options.Mode);
    parsedMatches.Add(parsed.Match);
    parsedEliminations.AddRange(parsed.Eliminations);

    foreach (var candidate in GetPlayerCandidates(parsed.Match, parsed.Replay))
    {
        var existing = playerCandidates.GetValueOrDefault(candidate.PlayerId) ?? candidate;
        if (!ReferenceEquals(existing, candidate))
        {
            existing.OfficialMatches += candidate.OfficialMatches;
            existing.OfficialKills += candidate.OfficialKills;
            existing.NamedMatches += candidate.NamedMatches;
        }

        playerCandidates[candidate.PlayerId] = existing;
    }

    Console.WriteLine($"OK {Path.GetFileName(replayFile)}");
}

var localPlayerId = options.PlayerId ?? PickLocalPlayerId(playerCandidates);
if (localPlayerId is not null)
{
    ApplyLocalPlayerStats(parsedMatches, localPlayerId);
}

PrintPlayerId(localPlayerId, options.PlayerId is not null, playerCandidates);
PrintMatches(parsedMatches);
PrintAggregate(parsedMatches);

WriteJson(Path.Combine(options.Output, "matches-csharp.json"), parsedMatches);
WriteJson(Path.Combine(options.Output, "eliminations-csharp.json"), parsedEliminations);
WriteCsv(Path.Combine(options.Output, "matches-csharp.csv"), parsedMatches);

Console.WriteLine($"\nArchivos generados en: {Path.GetFullPath(options.Output)}");

static ParsedReplay ParseReplay(string replayFile, ParseMode mode)
{
    var startedAt = DateTime.UtcNow;
    var reader = new ReplayReader(null!, mode);
    var replay = reader.ReadReplay(replayFile);
    var file = new FileInfo(replayFile);

    var match = new ParsedMatch
    {
        ReplayId = replay.GameData?.GameSessionId ?? Path.GetFileNameWithoutExtension(replayFile),
        FileName = Path.GetFileName(replayFile),
        FilePath = replayFile,
        FileSizeBytes = file.Length,
        ParsedInMs = (long)(DateTime.UtcNow - startedAt).TotalMilliseconds,
        StartedAt = replay.GameData?.UtcTimeStartedMatch?.ToString("O", CultureInfo.InvariantCulture),
        DurationSeconds = replay.GameData?.MatchEndTime,
        Duration = FormatDuration(replay.GameData?.MatchEndTime),
        Playlist = replay.GameData?.CurrentPlaylist,
        TotalPlayers = replay.TeamStats?.TotalPlayers ?? (uint?)replay.GameData?.MaxPlayers,
        Placement = replay.TeamStats?.Position,
        OfficialEliminations = replay.Stats?.Eliminations,
        DamageToPlayers = replay.Stats?.DamageToPlayers,
        DamageFromPlayers = replay.Stats?.DamageTaken,
        AccuracyPercent = replay.Stats is null ? null : replay.Stats.Accuracy * 100,
        Assists = replay.Stats?.Assists,
        Revives = replay.Stats?.Revives,
        WeaponDamage = replay.Stats?.WeaponDamage,
        OtherDamage = replay.Stats?.OtherDamage,
        DamageToStructures = replay.Stats?.DamageToStructures,
        MaterialsGathered = replay.Stats?.MaterialsGathered,
        MaterialsUsed = replay.Stats?.MaterialsUsed,
        TotalTraveled = replay.Stats?.TotalTraveled,
        EventEliminations = replay.Eliminations?.Count ?? 0,
        KillFeedEvents = replay.KillFeed?.Count ?? 0,
        PlayerRows = replay.PlayerData?.Count() ?? 0,
        TeamRows = replay.TeamData?.Count() ?? 0,
        StatsSource = replay.Stats is null ? "csharp_playerdata_or_killfeed" : "official_events",
    };

    match.PlayerDamageRatio = Ratio(match.DamageToPlayers, match.DamageFromPlayers);

    var eliminations = replay.Eliminations?
        .Select((elim, index) => new ParsedElimination
        {
            ReplayId = match.ReplayId,
            Index = index,
            Time = elim.Time,
            Eliminator = elim.Eliminator,
            Eliminated = elim.Eliminated,
            GunType = elim.GunType,
            Knocked = elim.Knocked,
            Distance = elim.Distance,
            Source = "eliminations",
        })
        .ToList() ?? new List<ParsedElimination>();

    return new ParsedReplay(match, replay, eliminations);
}

static IEnumerable<PlayerCandidate> GetPlayerCandidates(ParsedMatch match, FortniteReplay replay)
{
    foreach (var player in replay.PlayerData ?? Enumerable.Empty<PlayerData>())
    {
        if (string.IsNullOrWhiteSpace(player.PlayerId) || player.IsBot)
        {
            continue;
        }

        var isOfficialMatch = match.OfficialEliminations is not null && NormalizeUInt(player.Kills) == match.OfficialEliminations;
        var isNamed = string.Equals(player.PlayerName, "hiramrr.", StringComparison.OrdinalIgnoreCase);

        if (!isOfficialMatch && !isNamed)
        {
            continue;
        }

        yield return new PlayerCandidate
        {
            PlayerId = player.PlayerId,
            PlayerName = player.PlayerName,
            OfficialMatches = isOfficialMatch ? 1 : 0,
            OfficialKills = isOfficialMatch ? (int)(NormalizeUInt(player.Kills) ?? 0) : 0,
            NamedMatches = isNamed ? 1 : 0,
        };
    }
}

static string? PickLocalPlayerId(Dictionary<string, PlayerCandidate> candidates)
{
    return candidates.Values
        .OrderByDescending(candidate => candidate.NamedMatches)
        .ThenByDescending(candidate => candidate.OfficialMatches)
        .ThenByDescending(candidate => candidate.OfficialKills)
        .ThenBy(candidate => candidate.PlayerId)
        .FirstOrDefault()
        ?.PlayerId;
}

static void ApplyLocalPlayerStats(List<ParsedMatch> matches, string playerId)
{
    foreach (var match in matches)
    {
        var reader = new ReplayReader(null!, ParseMode.Normal);
        var replay = reader.ReadReplay(match.FilePath);
        var player = replay.PlayerData?.FirstOrDefault(p => string.Equals(p.PlayerId, playerId, StringComparison.OrdinalIgnoreCase));

        match.LocalPlayerId = playerId;
        match.PlayerName = player?.PlayerName;
        match.PlayerDataKills = NormalizeUInt(player?.Kills);
        match.PlayerDataTeamKills = NormalizeUInt(player?.TeamKills);
        match.PlayerDataPlacement = ToUInt(player?.Placement);

        var team = replay.TeamData?.FirstOrDefault(t => player?.Id is not null && t.PlayerIds?.Contains(player.Id) == true);
        match.TeamDataKills = team?.TeamKills;
        match.TeamDataPlacement = ToUInt(team?.Placement);

        var killFeed = replay.KillFeed ?? new List<KillFeedEntry>();
        match.KillFeedKills = killFeed.Count(k => player?.Id is not null && k.FinisherOrDowner == player.Id && k.PlayerId != player.Id && !k.IsRevived);
        match.KillFeedDeaths = killFeed.Count(k => player?.Id is not null && k.PlayerId == player.Id && !k.IsRevived);
        match.EventKills = replay.Eliminations?.Count(e => string.Equals(e.Eliminator, playerId, StringComparison.OrdinalIgnoreCase) && !e.Knocked);
        match.EventDeaths = replay.Eliminations?.Count(e => string.Equals(e.Eliminated, playerId, StringComparison.OrdinalIgnoreCase) && !e.Knocked);

        match.DisplayEliminations = match.OfficialEliminations
            ?? match.PlayerDataKills
            ?? ToUInt(match.KillFeedKills)
            ?? ToUInt(match.EventKills);

        match.DisplayTeamEliminations = match.PlayerDataTeamKills ?? match.TeamDataKills;
        match.DisplayDeaths = ToUInt(match.KillFeedDeaths) ?? ToUInt(match.EventDeaths);

        if (match.OfficialEliminations is null && match.PlayerDataKills is not null)
        {
            match.StatsSource = "csharp_playerdata";
        }
        else if (match.OfficialEliminations is null && match.KillFeedKills is not null)
        {
            match.StatsSource = "csharp_killfeed";
        }
    }
}

static IEnumerable<string> FindReplayFiles(string inputPath)
{
    var fullPath = Path.GetFullPath(inputPath);
    if (File.Exists(fullPath))
    {
        if (fullPath.EndsWith(".replay", StringComparison.OrdinalIgnoreCase))
        {
            yield return fullPath;
        }

        yield break;
    }

    if (!Directory.Exists(fullPath))
    {
        yield break;
    }

    foreach (var file in Directory.GetFiles(fullPath, "*.replay").OrderBy(file => file))
    {
        yield return file;
    }
}

static void PrintPlayerId(string? playerId, bool manual, Dictionary<string, PlayerCandidate> candidates)
{
    if (playerId is null)
    {
        Console.WriteLine("No pude inferir un playerId local.\n");
        return;
    }

    var source = manual ? "manual" : "inferido";
    var candidate = candidates.GetValueOrDefault(playerId);
    var name = string.IsNullOrWhiteSpace(candidate?.PlayerName) ? "" : $" ({candidate.PlayerName})";
    Console.WriteLine($"Player ID {source}: {playerId}{name}\n");
}

static void PrintMatches(IEnumerable<ParsedMatch> matches)
{
    var index = 1;
    foreach (var match in matches)
    {
        Console.WriteLine($"{index}. {match.FileName}");
        Console.WriteLine($"   Duracion: {match.Duration ?? "N/A"} | Playlist: {match.Playlist ?? "N/A"} | Fuente: {match.StatsSource}");
        Console.WriteLine($"   Kills: {Show(match.DisplayEliminations)} | Team kills: {Show(match.DisplayTeamEliminations)} | Deaths: {Show(match.DisplayDeaths)} | Placement: {Show(match.Placement ?? match.PlayerDataPlacement ?? match.TeamDataPlacement)}");
        Console.WriteLine($"   Damage: {Show(match.DamageToPlayers)} hecho / {Show(match.DamageFromPlayers)} recibido | Acc: {(match.AccuracyPercent is null ? "N/A" : $"{match.AccuracyPercent:0.0}%")}");
        Console.WriteLine($"   PlayerData kills: {Show(match.PlayerDataKills)} | KillFeed kills: {Show(match.KillFeedKills)} | Event kills: {Show(match.EventKills)}");
        Console.WriteLine($"   Filas: players={match.PlayerRows}, teams={match.TeamRows}, killFeed={match.KillFeedEvents}, eliminations={match.EventEliminations}");
        Console.WriteLine();
        index += 1;
    }
}

static void PrintAggregate(IEnumerable<ParsedMatch> matches)
{
    var rows = matches.ToList();
    Console.WriteLine("Resumen general");
    Console.WriteLine($"Partidas: {rows.Count}");
    Console.WriteLine($"Kills: {rows.Sum(row => row.DisplayEliminations ?? 0)}");
    Console.WriteLine($"Team kills: {rows.Sum(row => row.DisplayTeamEliminations ?? 0)}");
    Console.WriteLine($"Deaths: {rows.Sum(row => row.DisplayDeaths ?? 0)}");
    Console.WriteLine($"Damage to Players: {rows.Sum(row => row.DamageToPlayers ?? 0)}");
    Console.WriteLine($"Damage from Players: {rows.Sum(row => row.DamageFromPlayers ?? 0)}");
}

static void WriteJson(string path, object value)
{
    File.WriteAllText(path, JsonSerializer.Serialize(value, new JsonSerializerOptions { WriteIndented = true }) + Environment.NewLine);
}

static void WriteCsv(string path, IEnumerable<ParsedMatch> matches)
{
    var columns = new[]
    {
        "replayId", "fileName", "duration", "playlist", "playerName", "localPlayerId", "statsSource",
        "displayEliminations", "displayTeamEliminations", "displayDeaths", "placement",
        "officialEliminations", "playerDataKills", "playerDataTeamKills", "killFeedKills", "killFeedDeaths",
        "eventKills", "eventDeaths", "damageToPlayers", "damageFromPlayers", "accuracyPercent",
        "eventEliminations", "killFeedEvents", "playerRows", "teamRows", "filePath"
    };

    using var writer = new StreamWriter(path);
    writer.WriteLine(string.Join(",", columns));
    foreach (var match in matches)
    {
        writer.WriteLine(string.Join(",", columns.Select(column => Csv(GetColumn(match, column)))));
    }
}

static object? GetColumn(ParsedMatch match, string column) => column switch
{
    "replayId" => match.ReplayId,
    "fileName" => match.FileName,
    "duration" => match.Duration,
    "playlist" => match.Playlist,
    "playerName" => match.PlayerName,
    "localPlayerId" => match.LocalPlayerId,
    "statsSource" => match.StatsSource,
    "displayEliminations" => match.DisplayEliminations,
    "displayTeamEliminations" => match.DisplayTeamEliminations,
    "displayDeaths" => match.DisplayDeaths,
    "placement" => match.Placement ?? match.PlayerDataPlacement ?? match.TeamDataPlacement,
    "officialEliminations" => match.OfficialEliminations,
    "playerDataKills" => match.PlayerDataKills,
    "playerDataTeamKills" => match.PlayerDataTeamKills,
    "killFeedKills" => match.KillFeedKills,
    "killFeedDeaths" => match.KillFeedDeaths,
    "eventKills" => match.EventKills,
    "eventDeaths" => match.EventDeaths,
    "damageToPlayers" => match.DamageToPlayers,
    "damageFromPlayers" => match.DamageFromPlayers,
    "accuracyPercent" => match.AccuracyPercent,
    "eventEliminations" => match.EventEliminations,
    "killFeedEvents" => match.KillFeedEvents,
    "playerRows" => match.PlayerRows,
    "teamRows" => match.TeamRows,
    "filePath" => match.FilePath,
    _ => null,
};

static string Csv(object? value)
{
    if (value is null)
    {
        return "";
    }

    var text = Convert.ToString(value, CultureInfo.InvariantCulture) ?? "";
    return text.Contains(',') || text.Contains('"') || text.Contains('\n')
        ? $"\"{text.Replace("\"", "\"\"")}\""
        : text;
}

static string Show(object? value) => value?.ToString() ?? "N/A";

static uint? ToUInt(int? value) => value is null ? null : (uint)Math.Max(0, value.Value);

static uint? NormalizeUInt(uint? value) => value;

static string? FormatDuration(float? seconds)
{
    if (seconds is null)
    {
        return null;
    }

    var rounded = (int)Math.Round(seconds.Value);
    return $"{rounded / 60}:{rounded % 60:00}";
}

static double? Ratio(uint? numerator, uint? denominator)
{
    if (numerator is null || denominator is null || denominator == 0)
    {
        return null;
    }

    return (double)numerator / denominator;
}

internal sealed record ParsedReplay(ParsedMatch Match, FortniteReplay Replay, List<ParsedElimination> Eliminations);

internal sealed class PlayerCandidate
{
    public required string PlayerId { get; init; }
    public string? PlayerName { get; init; }
    public int OfficialMatches { get; set; }
    public int OfficialKills { get; set; }
    public int NamedMatches { get; set; }
}

internal sealed class ParsedMatch
{
    public required string ReplayId { get; init; }
    public required string FileName { get; init; }
    public required string FilePath { get; init; }
    public long FileSizeBytes { get; init; }
    public long ParsedInMs { get; init; }
    public string? StartedAt { get; init; }
    public float? DurationSeconds { get; init; }
    public string? Duration { get; init; }
    public string? Playlist { get; init; }
    public string? LocalPlayerId { get; set; }
    public string? PlayerName { get; set; }
    public string StatsSource { get; set; } = "";
    public uint? TotalPlayers { get; init; }
    public uint? Placement { get; init; }
    public uint? OfficialEliminations { get; init; }
    public uint? DisplayEliminations { get; set; }
    public uint? DisplayTeamEliminations { get; set; }
    public uint? DisplayDeaths { get; set; }
    public uint? DamageToPlayers { get; init; }
    public uint? DamageFromPlayers { get; init; }
    public double? PlayerDamageRatio { get; set; }
    public float? AccuracyPercent { get; init; }
    public uint? Assists { get; init; }
    public uint? Revives { get; init; }
    public uint? WeaponDamage { get; init; }
    public uint? OtherDamage { get; init; }
    public uint? DamageToStructures { get; init; }
    public uint? MaterialsGathered { get; init; }
    public uint? MaterialsUsed { get; init; }
    public uint? TotalTraveled { get; init; }
    public uint? PlayerDataKills { get; set; }
    public uint? PlayerDataTeamKills { get; set; }
    public uint? PlayerDataPlacement { get; set; }
    public uint? TeamDataKills { get; set; }
    public uint? TeamDataPlacement { get; set; }
    public int? KillFeedKills { get; set; }
    public int? KillFeedDeaths { get; set; }
    public int? EventKills { get; set; }
    public int? EventDeaths { get; set; }
    public int EventEliminations { get; init; }
    public int KillFeedEvents { get; init; }
    public int PlayerRows { get; init; }
    public int TeamRows { get; init; }
}

internal sealed class ParsedElimination
{
    public required string ReplayId { get; init; }
    public int Index { get; init; }
    public string? Time { get; init; }
    public string? Eliminator { get; init; }
    public string? Eliminated { get; init; }
    public byte GunType { get; init; }
    public bool Knocked { get; init; }
    public double? Distance { get; init; }
    public string Source { get; init; } = "";
}

internal sealed record CliOptions
{
    public string Input { get; private init; } = ".";
    public string Output { get; private init; } = "data-csharp";
    public string? PlayerId { get; private init; }
    public ParseMode Mode { get; private init; } = ParseMode.Normal;
    public bool Help { get; private init; }

    public static CliOptions Parse(string[] args)
    {
        var options = new CliOptions();

        for (var i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--input":
                case "-i":
                    options = options with { Input = args[++i] };
                    break;
                case "--output":
                case "-o":
                    options = options with { Output = args[++i] };
                    break;
                case "--player-id":
                    options = options with { PlayerId = args[++i].ToUpperInvariant() };
                    break;
                case "--mode":
                    options = options with { Mode = Enum.Parse<ParseMode>(args[++i], ignoreCase: true) };
                    break;
                case "--help":
                case "-h":
                    options = options with { Help = true };
                    break;
            }
        }

        return options;
    }
}
