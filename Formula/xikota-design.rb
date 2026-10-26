class XikotaDesign < Formula
  desc "Read the Xikota Design API and prepare project inquiries locally"
  homepage "https://xikota.design/docs#cli"
  url "https://xikota.design/cli/xikota-design-cli-0.1.2.tgz"
  version "0.1.2"
  sha256 "1bb41236a405c7a458c3d42dd3b5195bd5a81ba496058ee755f1de22391d8c92"
  license "ISC"

  depends_on "node"

  def install
    libexec.install Dir["*"]
    bin.mkpath
    (bin/"xikota-design").write <<~SH
      #!/bin/sh
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/bin/xikota-design.mjs" "$@"
    SH
    (bin/"xikota-design").chmod 0755
  end

  test do
    assert_equal version.to_s, shell_output("#{bin}/xikota-design --version").strip
    assert_match "Xikota Design", shell_output("#{bin}/xikota-design --help")
    assert_match '"writesSupportedByCli": false', shell_output("#{bin}/xikota-design discover")
  end
end
