Pod::Spec.new do |s|
  s.name = 'PsyRecTransfer'
  s.version = '0.1.0'
  s.summary = 'Private PsyRec camera capture and pinned PC transfer'
  s.description = 'In-memory photo capture, device-local encrypted queue and physical-QR certificate pinning.'
  s.license = { :type => 'MIT' }
  s.author = 'PsyRec contributors'
  s.homepage = 'https://github.com/Luis-Alain/hackpty'
  s.source = { :git => 'https://github.com/Luis-Alain/hackpty.git' }
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.0'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'CryptoKit', 'Security', 'UIKit'
  s.source_files = '*.{swift,h,m}'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
