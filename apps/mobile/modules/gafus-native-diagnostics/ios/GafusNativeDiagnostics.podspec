Pod::Spec.new do |s|
  s.name = 'GafusNativeDiagnostics'
  s.version = '1.0.0'
  s.summary = 'GAFUS bounded OS diagnostics'
  s.description = s.summary
  s.license = { :type => 'UNLICENSED' }
  s.author = 'GAFUS'
  s.homepage = 'https://gafus.ru'
  s.platforms = { :ios => '16.4' }
  s.source = { :git => 'https://github.com/asmtv1/gafus.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'MetricKit'
  s.swift_version = '5.9'
  s.source_files = '*.swift'
  s.resource_bundles = { 'GafusNativeDiagnostics_privacy' => ['PrivacyInfo.xcprivacy'] }
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
