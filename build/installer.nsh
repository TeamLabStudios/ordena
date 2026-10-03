!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\*\shell\Ordena"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\Ordena"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\Ordena"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Ordena"
!macroend
