class XikotaDesign < Formula
  desc "Read the Xikota Design API and prepare project inquiries locally"
  homepage "https://xikota.design/docs#cli"
  url "https://xikota.design/cli/xikota-design-cli-0.1.0.tgz"
  version "0.1.0"
  sha256 "64f4a1eabe47f4c36c5dc6c8d16313826a3dd8089e1bef928edda7148d37d110"
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
