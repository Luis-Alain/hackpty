import Foundation
import Security

/// One ephemeral, pinned session per request. No cookies, disk cache, redirects or background uploads.
final class PinnedHTTPS: NSObject, URLSessionDataDelegate {
  private let endpoint: URL
  private let pin: String
  private let completion: (Result<Data, Error>) -> Void
  private var session: URLSession?
  private var bytes = Data()
  private var finished = false

  private init(endpoint: URL, pin: String, completion: @escaping (Result<Data, Error>) -> Void) {
    self.endpoint = endpoint
    self.pin = pin
    self.completion = completion
  }

  static func post(endpoint: String, pin: String, path: String, body: [String: String], token: String? = nil,
    completion: @escaping (Result<Data, Error>) -> Void) throws {
    let url = try PinnedPeer.endpoint(endpoint, pin: pin)
    guard path == "/pair" || path == "/captures" else { throw CaptureFailure.rejected("Invalid transfer route.") }
    let delegate = PinnedHTTPS(endpoint: url, pin: pin, completion: completion)
    let configuration = URLSessionConfiguration.ephemeral
    configuration.urlCache = nil
    configuration.urlCredentialStorage = nil
    configuration.httpCookieStorage = nil
    configuration.httpShouldSetCookies = false
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    configuration.timeoutIntervalForRequest = 30
    configuration.timeoutIntervalForResource = 45
    configuration.waitsForConnectivity = false
    configuration.allowsCellularAccess = false
    configuration.tlsMinimumSupportedProtocolVersion = .TLSv12
    let queue = OperationQueue()
    queue.maxConcurrentOperationCount = 1
    let session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: queue)
    delegate.session = session
    var request = URLRequest(url: url.appendingPathComponent(String(path.dropFirst())))
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
    if let token { request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
    request.httpBody = try JSONSerialization.data(withJSONObject: body)
    session.dataTask(with: request).resume()
  }

  private func finish(_ result: Result<Data, Error>) {
    guard !finished else { return }
    finished = true
    completion(result)
    session?.invalidateAndCancel()
    session = nil
    bytes.resetBytes(in: 0..<bytes.count)
  }

  private func authenticate(_ challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    guard challenge.previousFailureCount == 0,
      challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
      challenge.protectionSpace.host == endpoint.host,
      challenge.protectionSpace.port == (endpoint.port ?? 443),
      let trust = challenge.protectionSpace.serverTrust,
      let certificate = SecTrustGetCertificateAtIndex(trust, 0) else {
      completionHandler(.cancelAuthenticationChallenge, nil)
      return
    }
    do {
      try PinnedPeer.verify(certificate, pin: pin)
      completionHandler(.useCredential, URLCredential(trust: trust))
    } catch { completionHandler(.cancelAuthenticationChallenge, nil) }
  }

  func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    authenticate(challenge, completionHandler: completionHandler)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    authenticate(challenge, completionHandler: completionHandler)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    completionHandler(nil)
    finish(.failure(CaptureFailure.rejected("PC redirects are forbidden. Encrypted queue retained.")))
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    guard let http = response as? HTTPURLResponse, http.statusCode == 200,
      response.expectedContentLength <= 16384 else {
      completionHandler(.cancel)
      finish(.failure(CaptureFailure.rejected("PC rejected the transfer or returned an oversized response. Encrypted queue retained.")))
      return
    }
    completionHandler(.allow)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    guard !finished else { return }
    guard bytes.count + data.count <= 16384 else {
      finish(.failure(CaptureFailure.rejected("PC response exceeds limit. Encrypted queue retained.")))
      return
    }
    bytes.append(data)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    if error != nil {
      finish(.failure(CaptureFailure.rejected("Secure transfer failed. Check Wi-Fi, PC pairing and local-network permission, then retry.")))
    } else { finish(.success(bytes)) }
  }
}
