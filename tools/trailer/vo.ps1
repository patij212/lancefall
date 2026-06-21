# Generate the trailer's removable voiceover via Windows SAPI (David, slowed). Per-line WAVs keyed by
# shot id → tools/trailer/vo/vo_<id>.wav. edit.mjs places them at each beat when run with VO=1.
#   powershell -ExecutionPolicy Bypass -File tools/trailer/vo.ps1
$dir = Join-Path $PSScriptRoot 'vo'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice('Microsoft David Desktop'); $s.Rate = -1; $s.Volume = 100
$lines = [ordered]@{
  fall       = "Lancefall was a kingdom of living light. Until it was enciphered into grey."
  verb       = "You are the last key. You don't shoot. You dash. A spear of light."
  turing     = "Your real weapon is cryptanalysis. Break a boss's cipher, to break the boss."
  readkey    = "Read the key. Find the symbol. Decode it under fire."
  memory     = "Each code you break decrypts the city. Grey, back to gold."
  imitation  = "The Mirrorblade learns you, move for move. The imitation game, made flesh."
  halting    = "The last lock, no machine can solve. Only you can choose."
  firstlight = "Break the final cipher. Bring back the longest day."
}
foreach ($k in $lines.Keys) { $s.SetOutputToWaveFile((Join-Path $dir "vo_$k.wav")); $s.Speak($lines[$k]) }
$s.Dispose()
Write-Output "VO generated → $dir"
